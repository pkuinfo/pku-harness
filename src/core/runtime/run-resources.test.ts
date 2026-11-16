import { expect, test } from 'bun:test';
import { registerRunResource, releaseRunResources } from './run-resources';

test('abort between tools releases once and finalization waits for release', async () => {
  const controller = new AbortController();
  let calls = 0;
  let finish!: () => void;
  registerRunResource(controller.signal, async () => {
    calls++;
    await new Promise<void>((resolve) => { finish = resolve; });
  });
  controller.abort();
  await Promise.resolve();
  expect(calls).toBe(1);
  let released = false;
  const pending = releaseRunResources(controller.signal).then(() => { released = true; });
  await Promise.resolve();
  expect(released).toBe(false);
  finish();
  await pending;
  expect(calls).toBe(1);
});

test('normal completion releases every resource despite one failure', async () => {
  const controller = new AbortController();
  let closed = 0;
  registerRunResource(controller.signal, async () => { throw new Error('gone'); });
  registerRunResource(controller.signal, async () => { closed++; });
  await releaseRunResources(controller.signal);
  await releaseRunResources(controller.signal);
  expect(closed).toBe(1);
});

test('an explicitly released resource and another run are left alone', async () => {
  const a = new AbortController();
  const b = new AbortController();
  let closed = 0;
  registerRunResource(a.signal, async () => { closed++; })();
  registerRunResource(b.signal, async () => { closed++; });
  await releaseRunResources(a.signal);
  expect(closed).toBe(0);
  await releaseRunResources(b.signal);
  expect(closed).toBe(1);
});

test('native resource cancellation cannot abort a completed or unrelated run', async () => {
  const { registerRunCancellation, cancelResourceRun } = await import('./run-resources');
  const a = new AbortController();
  const b = new AbortController();
  registerRunCancellation(a.signal, () => a.abort());
  registerRunCancellation(b.signal, () => b.abort());
  await releaseRunResources(a.signal);
  cancelResourceRun(a.signal);
  expect(a.signal.aborted).toBe(false);
  cancelResourceRun(b.signal);
  expect(b.signal.aborted).toBe(true);
  await releaseRunResources(b.signal);
});

test('a steered run hands its resources to the next run instead of releasing them', async () => {
  const { holdRunResources, transferRunResources } = await import('./run-resources');
  const steered = new AbortController();
  const next = new AbortController();
  let closed = 0;
  let movedTo: AbortSignal | undefined;
  const move = (to: AbortSignal) => {
    movedTo = to;
    registerRunResource(to, async () => { closed++; }, move);
  };
  registerRunResource(steered.signal, async () => { closed++; }, move);
  let plain = 0;
  registerRunResource(steered.signal, async () => { plain++; });
  holdRunResources(steered.signal);
  steered.abort();
  await releaseRunResources(steered.signal);
  expect(closed).toBe(0);
  transferRunResources(steered.signal, next.signal);
  await Promise.resolve();
  expect(movedTo).toBe(next.signal);
  // A resource that can't move is released by the steer.
  expect(plain).toBe(1);
  await releaseRunResources(next.signal);
  expect(closed).toBe(1);
});
