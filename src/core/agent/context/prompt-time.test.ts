/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { beijingTimeLine } from './prompt-time';

test('formats Beijing time from a UTC instant', () => {
  // 13:40 UTC = 21:40 in Beijing, Tuesday 2026-10-20.
  expect(beijingTimeLine(new Date(Date.UTC(2026, 9, 20, 13, 40)))).toBe('当前时间：2026-10-20 周二 21:40（北京时间）');
});

test('rolls the date and weekday over midnight in Beijing', () => {
  // 16:05 UTC on Saturday = 00:05 Sunday in Beijing.
  expect(beijingTimeLine(new Date(Date.UTC(2026, 9, 17, 16, 5)))).toBe('当前时间：2026-10-18 周日 00:05（北京时间）');
  // New year in Beijing while it is still 2026 in UTC.
  expect(beijingTimeLine(new Date(Date.UTC(2026, 11, 31, 16, 0)))).toBe('当前时间：2027-01-01 周五 00:00（北京时间）');
});

test('does not depend on the device time zone', () => {
  const instant = new Date(Date.UTC(2026, 2, 8, 23, 59));
  const before = process.env.TZ;
  const lines = ['America/New_York', 'Asia/Shanghai', 'UTC', 'Pacific/Kiritimati'].map((tz) => {
    process.env.TZ = tz;
    return beijingTimeLine(instant);
  });
  process.env.TZ = before;
  expect(new Set(lines).size).toBe(1);
  expect(lines[0]).toBe('当前时间：2026-03-09 周一 07:59（北京时间）');
});
