/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { localTimeLine } from './prompt-time';

// Built from local-time fields and read back as local-time fields, so these round-trip
// regardless of the test runner's TZ — the point of the change: the line follows the device zone.
test('formats the device-local time', () => {
  expect(localTimeLine(new Date(2026, 9, 20, 21, 40))).toBe('当前时间：2026-10-20 周二 21:40');
});

test('rolls the date and weekday over local midnight', () => {
  expect(localTimeLine(new Date(2026, 9, 18, 0, 5))).toBe('当前时间：2026-10-18 周日 00:05');
  expect(localTimeLine(new Date(2027, 0, 1, 0, 0))).toBe('当前时间：2027-01-01 周五 00:00');
});

test('tracks the device time zone', () => {
  // The same absolute instant renders in whatever zone the device is set to.
  const instant = new Date(Date.UTC(2026, 2, 8, 23, 59));
  const before = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai';
    expect(localTimeLine(instant)).toBe('当前时间：2026-03-09 周一 07:59');
    process.env.TZ = 'UTC';
    expect(localTimeLine(instant)).toBe('当前时间：2026-03-08 周日 23:59');
  } finally {
    process.env.TZ = before;
  }
});
