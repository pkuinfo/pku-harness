import { expect, test } from 'bun:test';
import { ApprovalQueue } from './approval-queue';

test('cancelling a queued approval removes it and advances to the next chat', async () => {
  const queue = new ApprovalQueue<{ task: string }>();
  const controller = new AbortController();
  const first = queue.enqueue({ task: 'first' }, controller.signal);
  const second = queue.enqueue({ task: 'second' });
  controller.abort();
  expect(await first).toBe(false);
  expect(queue.current()?.task).toBe('second');
  await queue.answer(queue.current()!.id, true);
  expect(await second).toBe(true);
  expect(queue.current()).toBeNull();
});

test('a cancelled run cannot become approved after its preference write finishes', async () => {
  const queue = new ApprovalQueue<{ task: string }>();
  const controller = new AbortController();
  const approval = queue.enqueue({ task: 'phone' }, controller.signal);
  const id = queue.current()!.id;
  let finish!: () => void;
  const saving = queue.answer(id, true, () => new Promise<void>((resolve) => { finish = resolve; }));
  controller.abort();
  expect(await approval).toBe(false);
  finish();
  await saving;
  expect(queue.get(id)).toBeUndefined();
});

test('failed persistence declines and settles the request', async () => {
  const queue = new ApprovalQueue<object>();
  const approval = queue.enqueue({});
  await queue.answer(queue.current()!.id, true, async () => { throw new Error('storage unavailable'); });
  expect(await approval).toBe(false);
  expect(queue.current()).toBeNull();
});

test('already cancelled requests never become visible', async () => {
  const queue = new ApprovalQueue<object>();
  const controller = new AbortController();
  controller.abort();
  expect(await queue.enqueue({}, controller.signal)).toBe(false);
  expect(queue.current()).toBeNull();
});
