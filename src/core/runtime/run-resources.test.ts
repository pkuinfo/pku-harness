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
