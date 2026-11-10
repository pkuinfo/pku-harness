import { expect, test } from 'bun:test';
import type { ModelMessage } from 'ai';
import { withModelImage } from '@pku-harness/sdk';

import { dropModelImage, NO_IMAGE_HERE, NO_IMAGE_MODEL, ToolImages } from './tool-images';

const shot = (data = 'aGVsbG8=') => withModelImage({ snapshotId: 's:1', width: 360, height: 720 }, { data, mediaType: 'image/jpeg' });
const call = { callId: 'c1', toolId: 'copilot.look', acceptsImages: true };
const history: ModelMessage[] = [
  { role: 'user', content: 'open WeChat' },
  { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'copilot__look', input: {} }] },
];

test('the tool output keeps no image; the next request carries it once, after the tool results', () => {
  const images = new ToolImages();
  const out = images.accept(shot(), call) as Record<string, unknown>;
  expect(JSON.stringify(out)).not.toContain('aGVsbG8=');
  expect(out.snapshotId).toBe('s:1');
  const next = images.prepare(history)!;
  expect(next).toHaveLength(3);
  const last = next[2]!;
  expect(last.role).toBe('user');
  expect(Array.isArray(last.content) && last.content.some((p) => p.type === 'image' && p.image === 'aGVsbG8=')).toBe(true);
  // The step after that (an action changed the screen) no longer carries the stale image.
  const after = images.prepare(next)!;
  expect(JSON.stringify(after)).not.toContain('aGVsbG8=');
  expect(images.prepare(after)).toBeUndefined();
});

test('a newer screenshot replaces the earlier one, which becomes text', () => {
  const images = new ToolImages();
  images.accept(shot('Zmlyc3Q='), call);
  const first = images.prepare(history)!;
  images.accept(shot('c2Vjb25k'), { ...call, callId: 'c2' });
  const second = images.prepare(first)!;
  const sent = JSON.stringify(second);
  expect(sent).not.toContain('Zmlyc3Q=');
  expect(sent).toContain('c2Vjb25k');
  expect(second).toHaveLength(4);
  expect(typeof second[2]!.content).toBe('string');
});

test('a model that reads no images gets an error, never the image', () => {
  const images = new ToolImages();
  expect(images.accept(shot(), { ...call, acceptsImages: false })).toEqual({ error: NO_IMAGE_MODEL });
  expect(images.prepare(history)).toBeUndefined();
});

test('outside a chat reply the image is dropped', () => {
  expect(dropModelImage(shot())).toEqual({ error: NO_IMAGE_HERE });
  const plain = { ok: true };
  expect(dropModelImage(plain)).toBe(plain);
});
