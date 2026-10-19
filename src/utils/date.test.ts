/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { formatClock, formatDateTime, formatFull } from './date';

test('chinese date formats', () => {
  const d = new Date(2026, 9, 18, 21, 4, 37);
  expect(formatClock(d)).toBe('21:04');
  expect(formatClock(d, true)).toBe('21:04:37');
  expect(formatDateTime(d, new Date(2026, 0, 1))).toBe('10月18日 21:04');
  expect(formatDateTime(d, new Date(2027, 0, 1))).toBe('2026年10月18日 21:04');
  expect(formatFull(d)).toBe('2026-10-18 21:04 周日');
});
