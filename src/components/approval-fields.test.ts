import { describe, expect, test } from 'bun:test';

import { approvalFields } from './approval-fields';

describe('approvalFields', () => {
  test('hides opaque ids the agent passes around', () => {
    expect(approvalFields({ sessionId: 'f827e57f', snapshotId: 'f827e57f:2', ref: 'e12', packageName: 'com.google.android.deskclock' })).toEqual([
      ['packageName', 'com.google.android.deskclock'],
    ]);
  });

  test('keeps meaningful fields, stringifies and shortens values', () => {
    const rows = approvalFields({ text: 'x'.repeat(100), count: 3, idle: true });
    expect(rows[0]).toEqual(['text', `${'x'.repeat(80)}…`]);
    expect(rows.slice(1)).toEqual([['count', '3'], ['idle', 'true']]);
  });

  test('nothing to show for non-objects', () => {
    expect(approvalFields(null)).toEqual([]);
    expect(approvalFields('x')).toEqual([]);
  });
});
