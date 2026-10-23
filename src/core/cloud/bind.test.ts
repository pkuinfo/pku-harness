/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { envelopeSchema, open } from '@pku-harness/cloud-protocol';
import { CloudError, type Channel, type CloudManifest, type PluginCloud } from '@pku-harness/sdk';

import { cloudFor, createPluginCloud, setBindDeps, type BindDeps, type ProviderSnapshot } from './bind';
import { CloudClient } from './client';
import { META, fakeProvider, testRand } from './fake-provider';
import { createStore, storeKey } from './store';

const manifest = (over: Partial<CloudManifest> = {}): CloudManifest => ({ protocol: 1, uses: ['channels'], e2e: true, disclosure: { zh: ['加密后的数据经云服务转发'] }, ...over });

function deps(over: { manifest?: CloudManifest | undefined; provider?: Partial<ProviderSnapshot>; granted?: boolean; allowOnRequest?: boolean } = {}) {
  let granted = over.granted ?? true;
  const requests: string[] = [];
  const opened: unknown[] = [];
  const storeCalls: string[] = [];
  const channel = { id: 'c1' } as unknown as Channel;
  const d: BindDeps = {
    manifest: () => ('manifest' in over ? over.manifest : manifest()),
    provider: () => ({ mode: 'custom', baseURL: 'https://cloud.test', meta: META, online: true, ...over.provider }),
    consent: {
      granted: () => granted,
      request: async (id) => {
        requests.push(id);
        if (over.allowOnRequest) granted = true;
        return !!over.allowOnRequest;
      },
    },
    store: () =>
      ({
        get: async (k: string) => (storeCalls.push(`get:${k}`), undefined),
        put: async (k: string) => (storeCalls.push(`put:${k}`), { version: 1 }),
        delete: async (k: string) => void storeCalls.push(`delete:${k}`),
        list: async () => [],
      }) as PluginCloud['store'],
    channels: () => ({
      open: async (pluginId, o) => (opened.push({ pluginId, ...o }), channel),
      get: (pluginId, id) => (pluginId === 'p1' && id === 'c1' ? channel : undefined),
      list: (pluginId) => (pluginId === 'p1' ? [channel] : []),
    }),
    message: (key, v) => `${key}:${v.plugin}:${v.service ?? ''}`,
  };
  return { d, requests, opened, storeCalls, channel };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(CloudError);
    return (e as CloudError).code;
  }
  return 'resolved';
};

describe('createPluginCloud: enforcement', () => {
  test('happy path: declared, configured, consented', async () => {
    const t = deps();
    const cloud = createPluginCloud('p1', t.d, { interactive: false });
    expect(cloud.available).toBe(true);
    expect(cloud.status()).toEqual({ provider: 'custom', baseURL: 'https://cloud.test', consented: true, online: true });
    await cloud.channels.open({ ttlS: 900, maxPeers: 1 });
    expect(t.opened).toEqual([{ pluginId: 'p1', ttlS: 900, maxPeers: 1 }]);
    expect(cloud.channels.get('c1')).toBe(t.channel);
    expect(cloud.channels.list()).toEqual([t.channel]);
  });

  test('provider off → not_configured', async () => {
    const t = deps({ provider: { mode: 'off', baseURL: undefined } });
    const cloud = createPluginCloud('p1', t.d, { interactive: true });
    expect(cloud.available).toBe(false);
    expect(await code(cloud.channels.open({ ttlS: 60 }))).toBe('not_configured');
    expect(t.requests).toEqual([]); // no consent prompt when there's nothing to consent to
  });

  test('undeclared service → protocol, even with consent', async () => {
    const t = deps();
    const cloud = createPluginCloud('p1', t.d, { interactive: false });
    expect(await code(cloud.store.get('k'))).toBe('protocol');
    expect(t.storeCalls).toEqual([]);
  });

  test('service the provider does not offer → not_configured', async () => {
    const t = deps({ manifest: manifest({ uses: ['channels', 'push'] }) });
    const cloud = createPluginCloud('p1', t.d, { interactive: false });
    expect(await code(cloud.push.schedule(1, {}))).toBe('not_configured');
    expect(cloud.available).toBe(false); // push is declared but not offered
  });

  test('no consent: agent gets consent_required, no prompt; lookups are empty', async () => {
    const t = deps({ granted: false });
    const cloud = createPluginCloud('p1', t.d, { interactive: false });
    expect(cloud.available).toBe(false);
    const e = await cloud.channels.open({ ttlS: 60 }).catch((x: CloudError) => x);
    expect((e as CloudError).code).toBe('consent_required');
    expect((e as CloudError).message).toBe('consentRequired:p1:channels');
    expect(t.requests).toEqual([]);
    expect(t.opened).toEqual([]);
    expect(cloud.channels.get('c1')).toBeUndefined();
    expect(cloud.channels.list()).toEqual([]);
  });

  test('no consent: interactive callers get the sheet; allow proceeds, deny fails', async () => {
    const allow = deps({ granted: false, allowOnRequest: true });
    await createPluginCloud('p1', allow.d, { interactive: true }).channels.open({ ttlS: 60 });
    expect(allow.requests).toEqual(['p1']);
    expect(allow.opened).toHaveLength(1);

    const deny = deps({ granted: false, allowOnRequest: false });
    expect(await code(createPluginCloud('p1', deny.d, { interactive: true }).channels.open({ ttlS: 60 }))).toBe('consent_required');
    expect(deny.opened).toEqual([]);
  });

  test('e2e plugins never send plaintext to functions', async () => {
    const e2e = deps({ manifest: manifest({ uses: ['functions'], e2e: true }), provider: { meta: { ...META, services: ['functions'] } } });
    const err = await createPluginCloud('p1', e2e.d, { interactive: false }).functions.invoke('f', { secret: 1 }).catch((x: CloudError) => x);
    expect((err as CloudError).code).toBe('protocol');
    expect((err as CloudError).message).toBe('plaintext:p1:functions');
  });

  test('functions go to the runtime hook; without it the cloud reads as not configured', async () => {
    const fn = deps({ manifest: manifest({ uses: ['functions'], e2e: false }), provider: { meta: { ...META, services: ['functions'] } } });
    const calls: unknown[] = [];
    fn.d.functions = async (pluginId, name, input) => (calls.push({ pluginId, name, input }), { ok: true });
    expect(await createPluginCloud('p1', fn.d, { interactive: false }).functions.invoke('report', { level: 'high' })).toEqual({ ok: true });
    expect(calls).toEqual([{ pluginId: 'p1', name: 'report', input: { level: 'high' } }]);
    delete fn.d.functions;
    expect(await code(createPluginCloud('p1', fn.d, { interactive: false }).functions.invoke('report', {}))).toBe('not_configured');
  });

  test('external backends are refused in v1', async () => {
    const t = deps({ manifest: manifest({ backend: { kind: 'external', url: 'https://x.org' } }) });
    const cloud = createPluginCloud('p1', t.d, { interactive: false });
    expect(cloud.available).toBe(false);
    expect(await code(cloud.channels.open({ ttlS: 60 }))).toBe('not_configured');
  });

  test('requestConsent asks only when needed', async () => {
    const t = deps({ granted: false, allowOnRequest: true });
    const cloud = createPluginCloud('p1', t.d, { interactive: false });
    expect(await cloud.requestConsent()).toBe(true);
    expect(await cloud.requestConsent()).toBe(true);
    expect(t.requests).toEqual(['p1']);
  });

  test('cloudFor: undefined without runtime or manifest', () => {
    setBindDeps(null);
    expect(cloudFor('p1')).toBeUndefined();
    setBindDeps(deps({ manifest: undefined }).d);
    expect(cloudFor('p1')).toBeUndefined();
    setBindDeps(deps().d);
    expect(cloudFor('p1')?.available).toBe(true);
    setBindDeps(null);
  });
});

describe('store e2e', () => {
  test('e2e values reach the server only as envelopes bound to their key', async () => {
    const puts: { path: string; body: unknown }[] = [];
    const stored = new Map<string, unknown>();
    const p = fakeProvider({
      routes: (req) => {
        const key = req.path.replace('/v1/store/', '');
        if (req.method === 'PUT') {
          puts.push({ path: req.path, body: req.body });
          stored.set(key, (req.body as { value: unknown }).value);
          return { status: 200, body: { version: 1 } };
        }
        if (req.method === 'GET' && stored.has(key)) return { status: 200, body: { key, value: stored.get(key), version: 1, updatedAt: 1 } };
        return undefined;
      },
    });
    const client = new CloudClient(p.deps);
    const box = p.identity.box.secretKey;
    const s = createStore({ client, pluginId: 'p1', e2e: true, boxSecretKey: async () => box, rand: testRand });
    await s.put('prefs/a', { secret: 'hello' });
    const wire = (puts[0]!.body as { value: unknown }).value;
    expect(envelopeSchema.safeParse(wire).success).toBe(true);
    expect(JSON.stringify(puts)).not.toContain('hello');
    expect(open(storeKey(box, 'p1'), envelopeSchema.parse(wire), { aad: 'prefs/a' })).toEqual({ secret: 'hello' });
    expect((await s.get('prefs/a'))?.value).toEqual({ secret: 'hello' });
    expect(await s.get('missing')).toBeUndefined();
    // Another plugin's key can't open it.
    expect(() => open(storeKey(box, 'p2'), envelopeSchema.parse(wire), { aad: 'prefs/a' })).toThrow();

    const plain = createStore({ client, pluginId: 'p1', e2e: false, boxSecretKey: async () => box, rand: testRand });
    await plain.put('b', { x: 1 });
    expect((puts[1]!.body as { value: unknown }).value).toEqual({ x: 1 });
  });

  test('offline reads fall back to the mirror', async () => {
    const p = fakeProvider({ routes: (req) => (req.method === 'GET' ? { status: 200, body: { key: 'k', value: 5, version: 2, updatedAt: 1 } } : undefined) });
    const client = new CloudClient(p.deps);
    const mem = new Map<string, unknown>();
    const mirror = { get: async <T,>(k: string) => mem.get(k) as T | undefined, set: async <T,>(k: string, v: T) => void mem.set(k, v), delete: async (k: string) => void mem.delete(k) };
    const s = createStore({ client, pluginId: 'p1', e2e: false, boxSecretKey: async () => p.identity.box.secretKey, rand: testRand, mirror });
    expect(await s.get('k')).toEqual({ value: 5, version: 2 });
    // The network is gone (every attempt and retry fails) → offline → mirror.
    const failing = new CloudClient({ ...p.deps, fetch: async () => Promise.reject(new TypeError('down')) });
    const s2 = createStore({ client: failing, pluginId: 'p1', e2e: false, boxSecretKey: async () => p.identity.box.secretKey, rand: testRand, mirror });
    expect(await s2.get('k')).toEqual({ value: 5, version: 2 });
    expect(await code(s2.put('k', 1))).toBe('offline');
  });
});
