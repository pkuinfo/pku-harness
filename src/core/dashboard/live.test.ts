/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { createLiveStore, queryKey } from './live';

function setup(persisted: Record<string, { value: unknown; fetchedAt: number; stale?: boolean }> = {}) {
  let now = 1_000_000;
  let calls = 0;
  let fail = false;
  const written: Record<string, unknown> = {};
  const store = createLiveStore({
    load: async (tool) => {
      calls++;
      if (fail) throw new Error('offline');
      return { tool, n: calls };
    },
    read: async (key) => persisted[key] ?? null,
    write: async (key, value) => {
      written[key] = value;
    },
    markStale: async (prefix) => {
      for (const k of Object.keys(persisted)) if (k.startsWith(prefix)) persisted[k] = { ...persisted[k], stale: true };
    },
    now: () => now,
  });
  return {
    store,
    written,
    calls: () => calls,
    advance: (ms: number) => (now += ms),
    setFail: (f: boolean) => (fail = f),
    now: () => now,
  };
}

const q = { tool: 'card.balance', ttlMinutes: 5 };

describe('live store', () => {
  test('dedupes concurrent fetches and serves fresh values from memory', async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.store.fetch(q), t.store.fetch(q)]);
    expect(a).toEqual(b);
    expect(t.calls()).toBe(1);
    await t.store.fetch(q);
    expect(t.calls()).toBe(1);
    expect(t.written[queryKey(q)]).toEqual(a);
  });

  test('refetches after the TTL, or when forced', async () => {
    const t = setup();
    await t.store.fetch(q);
    t.advance(4 * 60_000);
    await t.store.fetch(q);
    expect(t.calls()).toBe(1);
    t.advance(60_000);
    await t.store.fetch(q);
    expect(t.calls()).toBe(2);
    await t.store.fetch(q, true);
    expect(t.calls()).toBe(3);
  });

  test('hydrates the persisted value and uses it while fresh', async () => {
    const t = setup({ [queryKey(q)]: { value: 42, fetchedAt: 1_000_000 - 60_000 } });
    expect(await t.store.fetch(q)).toBe(42);
    expect(t.calls()).toBe(0);
  });

  test('an error keeps the last value', async () => {
    const t = setup();
    const v = await t.store.fetch(q);
    t.setFail(true);
    await expect(t.store.fetch(q, true)).rejects.toThrow('offline');
    const e = t.store.get(queryKey(q));
    expect(e?.value).toEqual(v);
    expect(e?.error).toBe('offline');
    expect(e?.fetching).toBe(false);
  });

  test('revalidates only stale active queries; release stops it', async () => {
    const t = setup();
    const release = t.store.activate([q, { tool: 'net.fee', ttlMinutes: 60 }]);
    await t.store.revalidateActive();
    expect(t.calls()).toBe(2);
    t.advance(10 * 60_000);
    await t.store.revalidateActive();
    expect(t.calls()).toBe(3); // only the 5-minute one
    release();
    t.advance(10 * 60_000);
    await t.store.revalidateActive();
    expect(t.calls()).toBe(3);
    expect(t.store.activeCount()).toBe(0);
  });

  test('primed values (from scheduled checks) count as fresh', async () => {
    const t = setup();
    t.store.prime(q, { balance: 88 });
    expect(await t.store.fetch(q)).toEqual({ balance: 88 });
    expect(t.calls()).toBe(0);
  });

  test('invalidate marks matching entries stale and refetches active ones', async () => {
    const t = setup();
    const other = { tool: 'wallet.netfeeBalance', ttlMinutes: 60 };
    await t.store.fetch({ ...q, ttlMinutes: 60 });
    await t.store.fetch(other);
    const release = t.store.activate([{ ...q, ttlMinutes: 60 }]);
    await t.store.invalidate('card.');
    expect(t.calls()).toBe(3); // only the active card query refetched
    expect(t.store.get(queryKey(q))?.stale).toBe(false);
    expect(t.store.get(queryKey(other))?.stale).not.toBe(true);
    release();
  });
});
