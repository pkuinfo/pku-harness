/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { CloudError } from '@pku-harness/sdk';
import { storeGetResponse } from '@pku-harness/cloud-protocol';

import { CloudClient, toCloudError } from './client';
import { fakeProvider } from './fake-provider';

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe('toCloudError', () => {
  test('maps wire codes onto SDK codes', () => {
    const cases: [string, string][] = [
      ['rate_limited', 'rate_limited'],
      ['quota', 'quota'],
      ['payload_too_large', 'quota'],
      ['gone', 'gone'],
      ['not_found', 'gone'],
      ['unsupported', 'not_configured'],
      ['server', 'server'],
      ['unauthorized', 'protocol'],
      ['forbidden', 'protocol'],
      ['conflict', 'protocol'],
      ['bad_request', 'protocol'],
      ['pow_invalid', 'protocol'],
    ];
    for (const [wire, sdk] of cases) {
      const e = toCloudError(400, JSON.stringify({ error: { code: wire, message: `m-${wire}` } }));
      expect(e).toBeInstanceOf(CloudError);
      expect([wire, e.code]).toEqual([wire, sdk]);
      expect(e.message).toBe(`m-${wire}`);
    }
  });

  test('retryAfterS from the body, else Retry-After', () => {
    expect(toCloudError(429, JSON.stringify({ error: { code: 'rate_limited', message: 'slow', retryAfterS: 12 } })).retryAfterS).toBe(12);
    expect(toCloudError(429, JSON.stringify({ error: { code: 'rate_limited', message: 'slow' } }), headers({ 'retry-after': '7' })).retryAfterS).toBe(7);
    expect(toCloudError(429, 'nope', headers({ 'retry-after': '3' }))).toMatchObject({ code: 'rate_limited', retryAfterS: 3 });
  });

  test('falls back to the status when the body is not an error body', () => {
    expect(toCloudError(413, '').code).toBe('quota');
    expect(toCloudError(410, '<html>').code).toBe('gone');
    expect(toCloudError(404, '{}').code).toBe('gone');
    expect(toCloudError(502, '').code).toBe('server');
    expect(toCloudError(400, '{"error":{"code":"weird","message":"x"}}').code).toBe('protocol');
    expect(toCloudError(500, '').retryAfterS).toBeUndefined();
  });
});

describe('CloudClient', () => {
  const routes = (seen: string[]) => (req: { method: string; path: string; headers: Record<string, string> }) => {
    if (req.path === '/v1/store/a') {
      seen.push(req.headers.token ?? '');
      return { status: 200, body: { key: 'a', value: 1, version: 1, updatedAt: 1 } };
    }
    return undefined;
  };

  test('registers with proof of work, mints a signed token, caches it', async () => {
    const seen: string[] = [];
    const p = fakeProvider({ routes: routes(seen) });
    const c = new CloudClient(p.deps);
    const auth = { plugin: 'card-share', services: ['store' as const] };
    const r1 = await c.request({ method: 'GET', path: '/v1/store/a', auth, schema: storeGetResponse });
    const r2 = await c.request({ method: 'GET', path: '/v1/store/a', auth, schema: storeGetResponse });
    expect(r1.value).toBe(1);
    expect(r2.version).toBe(1);
    expect(p.devices.size).toBe(1);
    expect(p.log.filter((l) => l.path === '/v1/auth/token')).toHaveLength(1);
    expect(seen[0]).toBe(seen[1]);
    expect(p.tokenInfo(seen[0]!)).toMatchObject({ plugin: 'card-share', services: ['store'] });
  });

  test('tokens are per plugin', async () => {
    const seen: string[] = [];
    const p = fakeProvider({ routes: routes(seen) });
    const c = new CloudClient(p.deps);
    await c.request({ method: 'GET', path: '/v1/store/a', auth: { plugin: 'one-plugin', services: ['store'] } });
    await c.request({ method: 'GET', path: '/v1/store/a', auth: { plugin: 'two-plugin', services: ['store'] } });
    expect(seen[0]).not.toBe(seen[1]);
  });

  test('re-mints once on 401 and re-registers when the provider forgot the device', async () => {
    let calls = 0;
    const p = fakeProvider({
      routes: (req) => {
        if (req.path !== '/v1/x') return undefined;
        calls++;
        return calls === 1 ? { status: 401, body: { error: { code: 'unauthorized', message: 'expired' } } } : { status: 200, body: {} };
      },
    });
    const c = new CloudClient(p.deps);
    await c.request({ method: 'GET', path: '/v1/x', auth: { plugin: 'p1', services: ['store'] } });
    expect(calls).toBe(2);
    expect(p.log.filter((l) => l.path === '/v1/auth/token')).toHaveLength(2);

    p.forgetDevices();
    c.forgetTokens();
    await c.request({ method: 'GET', path: '/v1/x', auth: { plugin: 'p1', services: ['store'] } });
    expect(p.log.filter((l) => l.path === '/v1/devices')).toHaveLength(2);
  });

  test('retries idempotent calls on network errors and 503, not POST; maps offline', async () => {
    let n = 0;
    const p = fakeProvider({ routes: (req) => (req.path === '/v1/y' ? (n++, { status: 200, body: {} }) : undefined) });
    const c = new CloudClient(p.deps);
    await c.token('p1', ['store']);
    p.failNext('network');
    await c.request({ method: 'GET', path: '/v1/y', auth: { plugin: 'p1', services: ['store'] } });
    expect(n).toBe(1);
    p.failNext(503);
    await c.request({ method: 'PUT', path: '/v1/y', auth: { plugin: 'p1', services: ['store'] } });
    expect(n).toBe(2);
    p.failNext('network');
    await expect(c.request({ method: 'POST', path: '/v1/y', auth: { plugin: 'p1', services: ['store'] } })).rejects.toMatchObject({ code: 'offline' });
  });

  test('surfaces rate limits with retryAfterS and validates responses', async () => {
    const p = fakeProvider({
      routes: (req) =>
        req.path === '/v1/limited'
          ? { status: 429, body: { error: { code: 'rate_limited', message: 'slow down' } }, headers: { 'Retry-After': '9' } }
          : req.path === '/v1/bad'
            ? { status: 200, body: { nope: true } }
            : undefined,
    });
    const c = new CloudClient(p.deps);
    const auth = { plugin: 'p1', services: ['store' as const] };
    await expect(c.request({ method: 'GET', path: '/v1/limited', auth })).rejects.toMatchObject({ code: 'rate_limited', retryAfterS: 9 });
    await expect(c.request({ method: 'GET', path: '/v1/bad', auth, schema: storeGetResponse })).rejects.toMatchObject({ code: 'protocol' });
  });
});
