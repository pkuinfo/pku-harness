import { expect, test } from 'bun:test';
import { releaseRunResources } from '../runtime/run-resources';
import { PhoneSessionLease } from './session-lease';

test('a concurrent chat cannot operate or end an owned phone session', async () => {
  const a = new AbortController();
  const b = new AbortController();
  const closed: string[] = [];
  const lease = new PhoneSessionLease(async (id) => { closed.push(id); });
  lease.claim('phone', a.signal);
  lease.claim('phone', a.signal);
  expect(() => lease.claim('phone', b.signal)).toThrow('another running chat');
  await expect(lease.end('phone', b.signal)).rejects.toThrow('another running chat');
  expect(closed).toEqual([]);
  await releaseRunResources(a.signal);
  expect(closed).toEqual(['phone']);
});

test('user stop removes cleanup and does not affect a replacement session', async () => {
  const a = new AbortController();
  const closed: string[] = [];
  const lease = new PhoneSessionLease(async (id) => { closed.push(id); });
  lease.claim('old', a.signal);
  await lease.end('old');
  await releaseRunResources(a.signal);
  expect(closed).toEqual(['old']);
});

test('finishing a handoff releases run ownership so a later chat turn can resume', async () => {
  const a = new AbortController();
  const b = new AbortController();
  let closed = 0;
  const finished: boolean[] = [];
  const lease = new PhoneSessionLease(async () => { closed++; }, async (_id, signal) => {
    finished.push(signal.aborted);
    if (signal.aborted) closed++;
  });
  lease.claim('phone', a.signal);
  await releaseRunResources(a.signal);
  expect(closed).toBe(0);
  lease.claim('phone', b.signal);
  b.abort();
  await releaseRunResources(b.signal);
  expect(closed).toBe(1);
  expect(finished).toEqual([false, true]);
});
