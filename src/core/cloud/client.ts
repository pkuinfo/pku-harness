import {
  authTokenResponse,
  errorBody,
  paths,
  registerDeviceResponse,
  signAuthChallenge,
  solvePow,
  type CloudServiceName,
  type MetaResponse,
  type RandomBytes,
  type WireErrorCode,
} from '@pku-harness/cloud-protocol';
import { CloudError, type CloudErrorCode } from '@pku-harness/sdk';
import type { z } from 'zod';

/**
 * HTTP client for one provider (docs/CLOUD.md §2.3): device registration with proof of work,
 * per-plugin bearer tokens minted from Ed25519-signed challenges (cached until shortly before
 * they expire), retries for idempotent calls, and every failure mapped onto `CloudError`.
 * Pure: `fetch`, randomness and the identity are injected (the app passes `expo/fetch`).
 */

export type FetchResponse = { status: number; headers: { get(name: string): string | null }; text(): Promise<string> };
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<FetchResponse>;

export interface ClientIdentity {
  signSecretKey: Uint8Array;
  /** base64url public keys. */
  signPub: string;
  boxPub: string;
}

export interface ClientDeps {
  baseURL: string;
  fetch: FetchLike;
  rand: RandomBytes;
  identity(): Promise<ClientIdentity>;
  /** This device's id at this provider (kept by the caller, per provider). */
  deviceId: { get(): Promise<string | undefined>; set(id: string | undefined): Promise<void> };
  /** `/v1/meta` (cached by the caller). */
  meta(): Promise<MetaResponse>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Told after every request whether the provider answered at all. */
  onReachability?(online: boolean): void;
  timeoutMs?: number;
  /** Proof-of-work chunk size (hashes between yields to the UI). */
  powChunk?: number;
}

export type Auth = { plugin: string; services: CloudServiceName[] };

export interface RequestOptions<T> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Plugin token auth; omit for public endpoints. */
  auth?: Auth;
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
}

const WIRE_TO_SDK: Record<WireErrorCode, CloudErrorCode> = {
  bad_request: 'protocol',
  unauthorized: 'protocol',
  forbidden: 'protocol',
  not_found: 'gone',
  gone: 'gone',
  conflict: 'protocol',
  payload_too_large: 'quota',
  rate_limited: 'rate_limited',
  quota: 'quota',
  pow_invalid: 'protocol',
  unsupported: 'not_configured',
  server: 'server',
};

function statusCode(status: number): CloudErrorCode {
  if (status === 429) return 'rate_limited';
  if (status === 413) return 'quota';
  if (status === 404 || status === 410) return 'gone';
  if (status >= 500) return 'server';
  return 'protocol';
}

/** Wire error code carried by a CloudError made from an error body (for callers that branch on it). */
export const wireCode = new WeakMap<CloudError, WireErrorCode>();

/** Map a non-2xx response onto a CloudError (errorBody when it parses, else the status). */
export function toCloudError(status: number, bodyText: string, headers?: { get(name: string): string | null }): CloudError {
  let parsed: z.infer<typeof errorBody> | undefined;
  try {
    const r = errorBody.safeParse(JSON.parse(bodyText));
    if (r.success) parsed = r.data;
  } catch {
    // not JSON
  }
  const header = headers?.get('retry-after');
  const headerS = header != null && /^\d+$/.test(header.trim()) ? Number(header.trim()) : undefined;
  const code = parsed ? WIRE_TO_SDK[parsed.error.code] : statusCode(status);
  const retryAfterS = code === 'rate_limited' ? (parsed?.error.retryAfterS ?? headerS) : undefined;
  const err = new CloudError(code, parsed ? parsed.error.message : `HTTP ${status}`, retryAfterS);
  if (parsed) wireCode.set(err, parsed.error.code);
  return err;
}

const IDEMPOTENT = new Set(['GET', 'PUT', 'DELETE', 'PATCH']);
const RETRY_DELAYS = [300, 900];
const TOKEN_MARGIN_MS = 30_000;

export class CloudClient {
  private tokens = new Map<string, { token: string; expiresAt: number }>();
  private minting = new Map<string, Promise<string>>();
  private registering: Promise<string> | null = null;

  constructor(private readonly deps: ClientDeps) {}

  get baseURL() {
    return this.deps.baseURL;
  }

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  private sleep(ms: number) {
    return this.deps.sleep ? this.deps.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms));
  }

  /** One HTTP exchange; network failures and timeouts become CloudError('offline'). */
  private async send(method: string, path: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal): Promise<FetchResponse & { bodyText: string }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.timeoutMs ?? 15_000);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await this.deps.fetch(this.deps.baseURL + path, {
        method,
        headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : null), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const bodyText = await res.text();
      this.deps.onReachability?.(true);
      return Object.assign(res, { bodyText });
    } catch (e) {
      if (e instanceof CloudError) throw e;
      if (signal?.aborted) throw new CloudError('offline', 'aborted');
      this.deps.onReachability?.(false);
      throw new CloudError('offline', e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private parse<T>(res: { bodyText: string }, schema?: z.ZodType<T>): T {
    if (!schema) return undefined as T;
    let json: unknown;
    try {
      json = res.bodyText ? JSON.parse(res.bodyText) : undefined;
    } catch {
      throw new CloudError('protocol', 'response is not JSON');
    }
    const r = schema.safeParse(json);
    if (!r.success) throw new CloudError('protocol', `unexpected response: ${r.error.issues[0]?.message ?? 'invalid'}`);
    return r.data;
  }

  /**
   * Call the provider. Idempotent methods are retried on network errors and 502/503/504; a 401
   * with a cached token re-mints it once. Never retries 429 (the caller sees retryAfterS).
   */
  async request<T = undefined>(opts: RequestOptions<T>): Promise<T> {
    let reminted = false;
    for (let attempt = 0; ; attempt++) {
      const headers = { ...opts.headers };
      if (opts.auth) headers.authorization = `Bearer ${await this.token(opts.auth.plugin, opts.auth.services)}`;
      let res: FetchResponse & { bodyText: string };
      try {
        res = await this.send(opts.method, opts.path, opts.body, headers, opts.signal);
      } catch (e) {
        if (e instanceof CloudError && e.code === 'offline' && !opts.signal?.aborted && IDEMPOTENT.has(opts.method) && attempt < RETRY_DELAYS.length) {
          await this.sleep(RETRY_DELAYS[attempt]!);
          continue;
        }
        throw e;
      }
      if (res.status >= 200 && res.status < 300) return this.parse(res, opts.schema);
      if (res.status === 401 && opts.auth && !reminted) {
        reminted = true;
        this.tokens.delete(tokenKey(opts.auth));
        continue;
      }
      if ([502, 503, 504].includes(res.status) && IDEMPOTENT.has(opts.method) && attempt < RETRY_DELAYS.length) {
        await this.sleep(RETRY_DELAYS[attempt]!);
        continue;
      }
      throw toCloudError(res.status, res.bodyText, res.headers);
    }
  }

  /** A bearer token for (plugin, services): cached, deduplicated while minting. */
  async token(plugin: string, services: CloudServiceName[]): Promise<string> {
    const key = tokenKey({ plugin, services });
    const cached = this.tokens.get(key);
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > this.now()) return cached.token;
    let p = this.minting.get(key);
    if (!p) {
      p = this.mint(plugin, services).finally(() => this.minting.delete(key));
      this.minting.set(key, p);
    }
    return p;
  }

  private async mint(plugin: string, services: CloudServiceName[], retried = false): Promise<string> {
    const deviceId = await this.ensureDevice();
    const id = await this.deps.identity();
    const body = signAuthChallenge({ aud: this.deps.baseURL, deviceId, plugin, services, now: this.now(), rand: this.deps.rand }, id.signSecretKey);
    const res = await this.send('POST', paths.authToken(), body, {});
    if (res.status >= 200 && res.status < 300) {
      const t = this.parse(res, authTokenResponse);
      this.tokens.set(tokenKey({ plugin, services }), t);
      return t.token;
    }
    const err = toCloudError(res.status, res.bodyText, res.headers);
    // The provider forgot this device (wiped, or its data was deleted): register again once.
    const code = wireCode.get(err);
    if (!retried && (code === 'unauthorized' || code === 'not_found' || res.status === 404)) {
      await this.deps.deviceId.set(undefined);
      return this.mint(plugin, services, true);
    }
    throw err;
  }

  /** This device's id at the provider, registering it first (proof of work) when needed. */
  async ensureDevice(signal?: AbortSignal): Promise<string> {
    const known = await this.deps.deviceId.get();
    if (known) return known;
    this.registering ??= this.register(signal).finally(() => {
      this.registering = null;
    });
    return this.registering;
  }

  private async register(signal?: AbortSignal, retried = false): Promise<string> {
    const meta = await this.deps.meta();
    const id = await this.deps.identity();
    let nonce: string;
    try {
      // Chunked and yielding (solvePow awaits a macrotask between chunks), so the UI keeps
      // rendering while a phone spends ~1 s on it.
      ({ nonce } = await solvePow({ salt: meta.pow.salt, signPub: id.signPub, boxPub: id.boxPub }, meta.pow.difficulty, { signal, chunk: this.deps.powChunk ?? 512 }));
    } catch (e) {
      throw new CloudError('protocol', e instanceof Error ? e.message : String(e));
    }
    const res = await this.send('POST', paths.devices(), { signPub: id.signPub, boxPub: id.boxPub, pow: { salt: meta.pow.salt, nonce } }, {}, signal);
    if (res.status >= 200 && res.status < 300) {
      const { deviceId } = this.parse(res, registerDeviceResponse);
      await this.deps.deviceId.set(deviceId);
      return deviceId;
    }
    const err = toCloudError(res.status, res.bodyText, res.headers);
    if (!retried && wireCode.get(err) === 'pow_invalid') return this.register(signal, true); // salt rotated
    throw err;
  }

  /** Wipe everything this device stored at the provider (`DELETE /v1/devices/me`). */
  async deleteDevice(services: CloudServiceName[]): Promise<void> {
    if (!(await this.deps.deviceId.get())) return;
    await this.request({ method: 'DELETE', path: paths.deviceMe(), auth: { plugin: HOST_PLUGIN_ID, services } });
    await this.deps.deviceId.set(undefined);
    this.forgetTokens();
  }

  forgetTokens() {
    this.tokens.clear();
  }
}

/** Plugin id the host uses for its own device-level calls (delete my data). */
export const HOST_PLUGIN_ID = 'harness';

function tokenKey(a: Auth) {
  return `${a.plugin}|${[...new Set(a.services)].sort().join(',')}`;
}
