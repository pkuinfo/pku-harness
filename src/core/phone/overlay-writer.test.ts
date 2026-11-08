import { expect, test } from 'bun:test';
import { OverlayWriter } from './overlay-writer';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('retry does not invalidate a slow mirror and a failure remains retryable', async () => {
  const writer = new OverlayWriter();
  const owner = writer.attach(async () => {});
  const started = gate(); const release = gate();
  const output: string[] = [];
  const write = owner.update(async (current) => { started.resolve(); await release.promise; if (current()) output.push('first'); });
  await started.promise;
  const retry = owner.retry(async () => { output.push('unexpected'); });
  release.resolve();
  await Promise.all([write, retry]);
  expect(output).toEqual(['first']);
  await owner.update(async () => { throw new Error('disconnected'); });
  await owner.retry(async () => { output.push('recovered'); });
  expect(output).toEqual(['first', 'recovered']);
});

test('old owner cleanup cannot erase a replacement while a native write is finishing', async () => {
  const writer = new OverlayWriter();
  const output: string[] = [];
  const old = writer.attach(async () => { output.push('old clear'); });
  const started = gate(); const release = gate();
  void old.update(async () => { started.resolve(); await release.promise; output.push('old write'); });
  await started.promise;
  void old.dispose();
  const next = writer.attach(async () => { output.push('new clear'); });
  const write = next.update(async () => { output.push('new write'); });
  release.resolve();
  await write;
  expect(output).toEqual(['old write', 'new write']);
  await next.dispose();
  expect(output).toEqual(['old write', 'new write', 'new clear']);
});

test('a canceled or replaced request cannot publish after its readiness read', async () => {
  const writer = new OverlayWriter();
  const owner = writer.attach(async () => {});
  const started = gate(); const release = gate();
  const output: string[] = [];
  void owner.update(async (current) => { started.resolve(); await release.promise; if (current()) output.push('stale'); });
  await started.promise;
  const next = owner.update(async () => { output.push('current'); });
  release.resolve();
  await next;
  expect(output).toEqual(['current']);
});


test('mounting during an already dispatched clear preserves the new owner', async () => {
  const writer = new OverlayWriter();
  const started = gate(); const release = gate();
  const old = writer.attach(async () => { started.resolve(); await release.promise; });
  void old.dispose();
  await started.promise;
  const next = writer.attach(async () => {});
  const output: string[] = [];
  const write = next.update(async () => { output.push('new'); });
  release.resolve();
  await write;
  expect(output).toEqual(['new']);
});
