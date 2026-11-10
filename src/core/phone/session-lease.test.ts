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

test('saved scope may start on a new turn but a stopped run cannot restart', async () => {
  const a = new AbortController();
  const b = new AbortController();
  const closed: string[] = [];
  const lease = new PhoneSessionLease(async (id) => { closed.push(id); });
  await lease.begin(async () => ({ sessionId: 'old' }), a.signal);
  await lease.end('old');
  await releaseRunResources(a.signal);
  let reopened = false;
  await expect(lease.begin(async () => { reopened = true; return { sessionId: 'unexpected' }; }, a.signal)).rejects.toThrow('new user message');
  expect(reopened).toBe(false);
  expect(() => lease.claim('replacement-from-ui', a.signal)).toThrow('new user message');
  await lease.begin(async () => ({ sessionId: 'new' }), b.signal);
  await releaseRunResources(b.signal);
  expect(closed).toEqual(['old', 'new']);
});

test('native stop cannot be bypassed by starting again in the same run', async () => {
  const run = new AbortController();
  const lease = new PhoneSessionLease(async () => {});
  await lease.begin(async () => ({ sessionId: 'phone' }), run.signal);
  // Native floating Stop closes the session before any JS lease callback is invoked.
  await expect(lease.begin(async () => ({ sessionId: 'replacement' }), run.signal)).rejects.toThrow('new user message');
  await releaseRunResources(run.signal);
});

test('cancellation during native session creation closes its late result', async () => {
  const run = new AbortController();
  const closed: string[] = [];
  const lease = new PhoneSessionLease(async (id) => { closed.push(id); });
  let resolve!: (value: { sessionId: string }) => void;
  const opened = lease.begin(() => new Promise<{ sessionId: string }>((done) => { resolve = done; }), run.signal);
  run.abort();
  resolve({ sessionId: 'late' });
  await expect(opened).rejects.toThrow();
  expect(closed).toEqual(['late']);
});

test('starting claims cleanup even before the agent performs its first operation', async () => {
  const run = new AbortController();
  const closed: string[] = [];
  const lease = new PhoneSessionLease(async (id) => { closed.push(id); });
  await lease.begin(async () => ({ sessionId: 'phone' }), run.signal);
  await releaseRunResources(run.signal);
  expect(closed).toEqual(['phone']);
});

test('native Stop cancels only its owning run and releases a pending approval', async () => {
  const { registerRunCancellation } = await import('../runtime/run-resources');
  const { ApprovalQueue } = await import('../runtime/approval-queue');
  const run = new AbortController();
  const other = new AbortController();
  registerRunCancellation(run.signal, () => run.abort());
  registerRunCancellation(other.signal, () => other.abort());
  const lease = new PhoneSessionLease(async () => {});
  lease.claim('phone', run.signal);
  const approvals = new ApprovalQueue<{ sessionId: string }>();
  const pending = approvals.enqueue({ sessionId: 'phone' }, run.signal);
  lease.stopRun('old-session');
  expect(run.signal.aborted).toBe(false);
  lease.stopRun('phone');
  expect(run.signal.aborted).toBe(true);
  expect(other.signal.aborted).toBe(false);
  expect(await pending).toBe(false);
  expect(approvals.current()).toBeNull();
  await releaseRunResources(run.signal);
  await expect(lease.begin(async () => ({ sessionId: 'replacement' }), run.signal)).rejects.toThrow();
  await releaseRunResources(other.signal);
});

test('in-app user Stop cancels the model but normal tool end does not', async () => {
  const { registerRunCancellation } = await import('../runtime/run-resources');
  const a = new AbortController();
  const b = new AbortController();
  registerRunCancellation(a.signal, () => a.abort());
  registerRunCancellation(b.signal, () => b.abort());
  const lease = new PhoneSessionLease(async () => {});
  lease.claim('user-stops', a.signal);
  await lease.end('user-stops');
  expect(a.signal.aborted).toBe(true);
  lease.claim('agent-finishes', b.signal);
  await lease.end('agent-finishes', b.signal);
  expect(b.signal.aborted).toBe(false);
  await releaseRunResources(a.signal);
  await releaseRunResources(b.signal);
});

test('a stale session id from an earlier turn does not block starting a new one', async () => {
  const run = new AbortController();
  const lease = new PhoneSessionLease(async () => {});
  // The agent reuses an id from the previous, stopped turn; the phone answers ENDED.
  lease.claim('stopped-earlier', run.signal);
  lease.forgetStale('stopped-earlier', run.signal);
  await expect(lease.begin(async () => ({ sessionId: 'fresh' }), run.signal)).resolves.toEqual({ sessionId: 'fresh' });
  await releaseRunResources(run.signal);
});

test('a session this run saw alive still blocks a restart after it ends', async () => {
  const run = new AbortController();
  const lease = new PhoneSessionLease(async () => {});
  lease.claim('phone', run.signal);
  lease.confirm('phone', run.signal);
  lease.forgetStale('phone', run.signal);
  await expect(lease.begin(async () => ({ sessionId: 'replacement' }), run.signal)).rejects.toThrow('new user message');
  const opened = new AbortController();
  await lease.begin(async () => ({ sessionId: 'mine' }), opened.signal);
  lease.forgetStale('mine', opened.signal);
  await expect(lease.begin(async () => ({ sessionId: 'again' }), opened.signal)).rejects.toThrow('new user message');
  await releaseRunResources(run.signal);
  await releaseRunResources(opened.signal);
});
