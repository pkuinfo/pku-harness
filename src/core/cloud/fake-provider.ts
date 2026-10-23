/**
 * A tiny in-memory stand-in for a PKU Harness Cloud provider, enough for client / store /
 * channel unit tests: /v1/meta, device registration (verifies the proof of work), signed token
 * auth (verifies the signature) and a route table per test. Requests and bodies are validated
 * against the wire schemas so tests catch protocol drift.
 */
import {
  DEFAULT_LIMITS,
  authTokenRequest,
  fromB64url,
  generateDeviceIdentity,
  registerDeviceRequest,
  toB64url,
  verifyAuthChallenge,
  verifyPow,
  type MetaResponse,
} from '@pku-harness/cloud-protocol';

import type { ClientDeps, FetchLike, FetchResponse } from './client';

export const BASE = 'https://cloud.test';

export const META: MetaResponse = {
  protocol: 1,
  services: ['store', 'channels'],
  limits: DEFAULT_LIMITS,
  pow: { difficulty: 4, salt: 'salt1' },
  pages: [],
  functions: [],
  operator: { name: 'Test operator', contact: 'ops@test' },
};

let counter = 0;
/** Deterministic-enough randomness for tests (not crypto). */
export const testRand = (n: number) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (counter++ * 131 + i * 7 + 13) & 0xff;
  return out;
};

export type Handler = (req: { method: string; path: string; headers: Record<string, string>; body: unknown }) => { status: number; body?: unknown; headers?: Record<string, string> } | undefined;

export function response(status: number, body?: unknown, headers: Record<string, string> = {}): FetchResponse {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, headers: { get: (n) => lower[n.toLowerCase()] ?? null }, text: async () => (body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)) };
}

export function fakeProvider(opts: { routes?: Handler } = {}) {
  const devices = new Map<string, { signPub: string }>();
  const tokens = new Map<string, { device: string; plugin: string; services: string[]; doc?: { link: string; hash: string } }>();
  const log: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = [];
  let tokenSeq = 0;
  let failNext: 'network' | number | null = null;

  const fetch: FetchLike = async (url, init) => {
    const path = url.slice(BASE.length);
    const body = init.body ? JSON.parse(init.body) : undefined;
    log.push({ method: init.method, path, body, headers: init.headers });
    if (failNext === 'network') {
      failNext = null;
      throw new TypeError('Network request failed');
    }
    if (typeof failNext === 'number') {
      const s = failNext;
      failNext = null;
      return response(s, { error: { code: 'server', message: 'boom' } });
    }
    if (path === '/v1/meta') return response(200, META);
    if (path === '/v1/devices' && init.method === 'POST') {
      const r = registerDeviceRequest.safeParse(body);
      if (!r.success) return response(400, { error: { code: 'bad_request', message: r.error.message } });
      if (!verifyPow({ salt: r.data.pow.salt, signPub: r.data.signPub, boxPub: r.data.boxPub }, r.data.pow.nonce, META.pow.difficulty)) return response(400, { error: { code: 'pow_invalid', message: 'bad pow' } });
      const id = `dev${devices.size + 1}xxxxx`;
      devices.set(id, { signPub: r.data.signPub });
      return response(201, { deviceId: id });
    }
    if (path === '/v1/auth/token') {
      const r = authTokenRequest.safeParse(body);
      if (!r.success) return response(400, { error: { code: 'bad_request', message: r.error.message } });
      const d = devices.get(r.data.deviceId);
      if (!d) return response(401, { error: { code: 'unauthorized', message: 'unknown device' } });
      const v = verifyAuthChallenge(r.data, fromB64url(d.signPub), { aud: BASE });
      if (!v.ok) return response(401, { error: { code: 'unauthorized', message: v.reason } });
      const token = `tok-${++tokenSeq}-${'x'.repeat(16)}`;
      tokens.set(token, { device: r.data.deviceId, plugin: r.data.plugin, services: r.data.services, doc: r.data.doc });
      return response(200, { token, expiresAt: Date.now() + 600_000 });
    }
    const auth = init.headers.authorization?.replace(/^Bearer /, '');
    const routed = opts.routes?.({ method: init.method, path, headers: { ...init.headers, ...(auth ? { token: auth } : null) }, body });
    if (routed) return response(routed.status, routed.body, routed.headers);
    return response(404, { error: { code: 'not_found', message: `no route ${init.method} ${path}` } });
  };

  const id = generateDeviceIdentity(testRand);
  let deviceId: string | undefined;
  const deps: ClientDeps = {
    baseURL: BASE,
    fetch,
    rand: testRand,
    identity: async () => ({ signSecretKey: id.sign.secretKey, signPub: toB64url(id.sign.publicKey), boxPub: toB64url(id.box.publicKey) }),
    deviceId: { get: async () => deviceId, set: async (v) => void (deviceId = v) },
    meta: async () => META,
    sleep: async () => {},
    powChunk: 64,
  };
  return {
    fetch,
    deps,
    identity: id,
    log,
    devices,
    tokens,
    tokenInfo: (t: string) => tokens.get(t),
    failNext: (f: 'network' | number) => void (failNext = f),
    revokeTokens: () => tokens.clear(),
    forgetDevices: () => devices.clear(),
  };
}
