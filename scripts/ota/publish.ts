/**
 * Build and sign an over-the-air update into a staging folder laid out like the server.
 *
 *   OTA_SIGNING_KEY="$(cat private-key.pem)" bun scripts/ota/publish.ts \
 *     --channel production --platform android [--runtime-version <v>] [--out .ota]
 *
 * Steps: `expo export` → manifest (hashes, absolute asset URLs) → RSA-SHA256 signature →
 * `.ota/manifests/<channel>/<platform>/<runtimeVersion>.multipart` + `.ota/assets/*` +
 * `.ota/history/...json`. Upload with scripts/ota/sync.ts. See docs/OTA.md.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildManifest,
  CHANNELS,
  type Channel,
  type ExportMetadata,
  manifestPath,
  PLATFORMS,
  type Platform,
  updateResponse,
} from './lib';

const { values } = parseArgs({
  options: {
    channel: { type: 'string', default: 'production' },
    platform: { type: 'string', default: 'android' },
    'runtime-version': { type: 'string' },
    'base-url': { type: 'string', default: process.env.OTA_BASE_URL ?? 'https://harness.novadiffusion.com/updates' },
    out: { type: 'string', default: '.ota' },
    'skip-export': { type: 'boolean', default: false },
  },
});

const channel = values.channel as Channel;
const platform = values.platform as Platform;
if (!CHANNELS.includes(channel)) throw new Error(`--channel must be one of ${CHANNELS.join(', ')}`);
if (!PLATFORMS.includes(platform)) throw new Error(`--platform must be one of ${PLATFORMS.join(', ')}`);
const key = process.env.OTA_SIGNING_KEY;
if (!key?.includes('PRIVATE KEY')) throw new Error('OTA_SIGNING_KEY must hold the PEM private key');

const run = (cmd: string[]) => {
  const p = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'inherit', env: process.env });
  if (p.exitCode !== 0) throw new Error(`${cmd.join(' ')} failed (${p.exitCode})`);
  return p.stdout.toString();
};

const out = values.out;
const exportDir = join(out, 'export', platform);
if (!values['skip-export']) {
  rmSync(exportDir, { recursive: true, force: true });
  run(['bunx', 'expo', 'export', '--platform', platform, '--output-dir', exportDir]);
}

// runtimeVersion exactly as the app binary computes it (fingerprint policy), unless overridden.
const runtimeVersion =
  values['runtime-version'] ??
  (JSON.parse(run(['bunx', 'expo-updates', 'runtimeversion:resolve', '--platform', platform])) as {
    runtimeVersion: string | null;
  }).runtimeVersion;
if (!runtimeVersion) throw new Error('could not resolve runtimeVersion (is expo-updates configured?)');

const meta = JSON.parse(readFileSync(join(exportDir, 'metadata.json'), 'utf8')) as ExportMetadata;
const files = meta.fileMetadata[platform];
if (!files) throw new Error(`metadata.json has no ${platform} bundle`);
const expoClient = JSON.parse(run(['bunx', 'expo', 'config', '--type', 'public', '--json'])) as Record<
  string,
  unknown
>;

const read = (path: string, ext: string) => ({ path, ext, bytes: readFileSync(join(exportDir, path)) });
const createdAt = new Date().toISOString();
const commit = process.env.GITHUB_SHA ?? run(['git', 'rev-parse', 'HEAD']).trim();
const built = buildManifest({
  platform,
  runtimeVersion,
  baseUrl: values['base-url'],
  createdAt,
  bundle: read(files.bundle, 'bundle'),
  assets: files.assets.map((a) => read(a.path, a.ext)),
  expoClient,
  metadata: { channel },
});

const write = (rel: string, data: string) => {
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  writeFileSync(join(out, rel), data);
};
for (const f of built.files) {
  mkdirSync(dirname(join(out, f.to)), { recursive: true });
  copyFileSync(join(exportDir, f.from), join(out, f.to));
}
write(manifestPath(channel, platform, runtimeVersion), updateResponse(built.manifest, key));
// History: what each published update referenced (for pruning, audits and re-publishing).
write(
  `history/${channel}/${platform}/${runtimeVersion}/${createdAt.replace(/[:.]/g, '-')}.json`,
  `${JSON.stringify({ commit, manifest: built.manifest }, null, 2)}\n`,
);

console.log(
  `✓ ${channel}/${platform} runtime ${runtimeVersion}: update ${built.manifest.id} (${built.files.length} files, commit ${commit.slice(0, 7)})`,
);
