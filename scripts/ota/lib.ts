/**
 * Over-the-air updates: pure helpers (no I/O) shared by publish.ts, rollback.ts and the tests.
 *
 * The update server is static (server/updates/Caddyfile): Caddy picks a pre-built, pre-signed
 * multipart file by the expo-platform / expo-runtime-version / expo-channel-name request headers.
 * So everything the protocol needs — manifest, signature, directive — is produced here, in CI,
 * with the maintainer-held key. The server never sees the key. Spec:
 * https://docs.expo.dev/technical-specs/expo-updates-1/
 */
import { createHash, createSign, createVerify } from 'node:crypto';

/** Fixed multipart boundary: Caddy sets `content-type: multipart/mixed; boundary=<this>` statically. */
export const BOUNDARY = 'pkuharness-ota-boundary';
export const CHANNELS = ['production', 'preview'] as const;
export const PLATFORMS = ['android', 'ios'] as const;
export const KEY_ID = 'main';
export const ALG = 'rsa-v1_5-sha256';
/** Must match the header_regexp in server/updates/Caddyfile. */
export const RUNTIME_VERSION = /^[A-Za-z0-9._-]{1,128}$/;

export type Channel = (typeof CHANNELS)[number];
export type Platform = (typeof PLATFORMS)[number];

export interface Asset {
  hash: string;
  key: string;
  contentType: string;
  fileExtension?: string;
  url: string;
}

export interface Manifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: Asset;
  assets: Asset[];
  metadata: Record<string, string>;
  extra: Record<string, unknown>;
}

export interface Directive {
  type: string;
  parameters?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

/** `expo export` writes this to <output>/metadata.json. */
export interface ExportMetadata {
  version: number;
  bundler: string;
  fileMetadata: Partial<Record<Platform, { bundle: string; assets: { path: string; ext: string }[] }>>;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  json: 'application/json',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  html: 'text/html',
  txt: 'text/plain',
};

export function contentTypeOf(ext: string): string {
  return MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

/** SHA-256, Base64URL without padding (the protocol's `hash`). */
export function sha256Base64Url(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('base64url');
}

/** MD5 hex: the asset `key` Metro's asset registry uses (`assets/<md5>` in the export). */
export function md5Hex(data: Uint8Array): string {
  return createHash('md5').update(data).digest('hex');
}

/** A UUID-shaped id derived from content, so re-publishing the same export gives the same id. */
export function contentUuid(parts: string[]): string {
  const h = createHash('sha256').update(parts.join('\n')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Server-relative storage path of an asset: content-addressed and immutable. */
export function assetPath(hash: string, ext: string): string {
  return `assets/${hash}.${ext}`;
}

export function manifestPath(channel: Channel, platform: Platform, runtimeVersion: string): string {
  return `manifests/${channel}/${platform}/${runtimeVersion}.multipart`;
}

export interface FileInfo {
  /** Path inside the export directory, from metadata.json. */
  path: string;
  ext: string;
  bytes: Uint8Array;
}

export interface BuiltUpdate {
  manifest: Manifest;
  /** Files to upload: server-relative path → source path in the export dir. */
  files: { to: string; from: string }[];
}

/** Build the manifest for one platform from an `expo export` and the files it lists. */
export function buildManifest(opts: {
  platform: Platform;
  runtimeVersion: string;
  baseUrl: string;
  createdAt: string;
  bundle: FileInfo;
  assets: FileInfo[];
  expoClient?: Record<string, unknown>;
  metadata?: Record<string, string>;
}): BuiltUpdate {
  if (!RUNTIME_VERSION.test(opts.runtimeVersion))
    throw new Error(`runtimeVersion "${opts.runtimeVersion}" must match ${RUNTIME_VERSION}`);
  const base = opts.baseUrl.replace(/\/+$/, '');
  const files: BuiltUpdate['files'] = [];
  const toAsset = (f: FileInfo, launch: boolean): Asset => {
    const hash = sha256Base64Url(f.bytes);
    const ext = launch ? 'bundle' : f.ext;
    const to = assetPath(hash, ext);
    files.push({ to, from: f.path });
    return {
      hash,
      key: md5Hex(f.bytes),
      contentType: launch ? 'application/javascript' : contentTypeOf(f.ext),
      ...(launch ? {} : { fileExtension: `.${f.ext}` }),
      url: `${base}/${to}`,
    };
  };
  const launchAsset = toAsset(opts.bundle, true);
  const assets = opts.assets.map((a) => toAsset(a, false));
  const id = contentUuid([
    opts.runtimeVersion,
    opts.platform,
    launchAsset.hash,
    ...assets.map((a) => a.hash).sort(),
  ]);
  return {
    manifest: {
      id,
      createdAt: opts.createdAt,
      runtimeVersion: opts.runtimeVersion,
      launchAsset,
      assets,
      metadata: opts.metadata ?? {},
      extra: opts.expoClient ? { expoClient: opts.expoClient } : {},
    },
    files,
  };
}

/** RSA-SHA256 (PKCS#1 v1.5) signature, base64, over the exact UTF-8 body. */
export function sign(body: string, privateKeyPem: string): string {
  return createSign('RSA-SHA256').update(body, 'utf8').sign(privateKeyPem, 'base64');
}

export function verify(body: string, signature: string, publicKeyOrCertPem: string): boolean {
  return createVerify('RSA-SHA256').update(body, 'utf8').verify(publicKeyOrCertPem, signature, 'base64');
}

/** `expo-signature` header value: an SFV dictionary of strings. */
export function signatureHeader(signature: string): string {
  return `sig="${signature}", keyid="${KEY_ID}", alg="${ALG}"`;
}

export interface Part {
  name: 'manifest' | 'directive' | 'extensions';
  body: string;
  signature?: string;
}

/** multipart/mixed body (RFC 2046) with CRLF line endings and the fixed BOUNDARY. */
export function multipart(parts: Part[]): string {
  let out = '';
  for (const p of parts) {
    if (p.body.includes(`--${BOUNDARY}`)) throw new Error(`part "${p.name}" contains the multipart boundary`);
    out += `--${BOUNDARY}\r\n`;
    out += 'content-type: application/json; charset=utf-8\r\n';
    out += `content-disposition: form-data; name="${p.name}"\r\n`;
    if (p.signature) out += `expo-signature: ${signatureHeader(p.signature)}\r\n`;
    out += `\r\n${p.body}\r\n`;
  }
  return `${out}--${BOUNDARY}--\r\n`;
}

/** The signed multipart file for a normal update. */
export function updateResponse(manifest: Manifest, privateKeyPem: string): string {
  const body = JSON.stringify(manifest);
  return multipart([
    { name: 'manifest', body, signature: sign(body, privateKeyPem) },
    { name: 'extensions', body: JSON.stringify({ assetRequestHeaders: {} }) },
  ]);
}

/** The signed multipart file telling clients on this runtime to go back to the embedded update. */
export function rollbackResponse(commitTime: string, privateKeyPem: string): string {
  const directive: Directive = { type: 'rollBackToEmbedded', parameters: { commitTime } };
  const body = JSON.stringify(directive);
  return multipart([{ name: 'directive', body, signature: sign(body, privateKeyPem) }]);
}

/** Parse a multipart body back into parts (tests and `ota verify`). */
export function parseMultipart(text: string): { name: string; headers: Record<string, string>; body: string }[] {
  const out: { name: string; headers: Record<string, string>; body: string }[] = [];
  for (const chunk of text.split(`--${BOUNDARY}`).slice(1)) {
    if (chunk.startsWith('--')) break;
    const [head, ...rest] = chunk.replace(/^\r\n/, '').split('\r\n\r\n');
    const headers: Record<string, string> = {};
    for (const line of head.split('\r\n')) {
      const i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    const name = /name="([^"]+)"/.exec(headers['content-disposition'] ?? '')?.[1] ?? '';
    out.push({ name, headers, body: rest.join('\r\n\r\n').replace(/\r\n$/, '') });
  }
  return out;
}

/** Read `sig` out of an expo-signature header value. */
export function signatureOf(header: string): string | undefined {
  return /sig="([^"]+)"/.exec(header)?.[1];
}

/** Which stored assets to keep: everything referenced by the newest `keep` updates of each target. */
export function assetsToKeep(
  history: { target: string; createdAt: string; assets: string[] }[],
  keep: number,
): Set<string> {
  const byTarget = new Map<string, typeof history>();
  for (const h of history) byTarget.set(h.target, [...(byTarget.get(h.target) ?? []), h]);
  const out = new Set<string>();
  for (const list of byTarget.values())
    for (const h of list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, keep))
      for (const a of h.assets) out.add(a);
  return out;
}
