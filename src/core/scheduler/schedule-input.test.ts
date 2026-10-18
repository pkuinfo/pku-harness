/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { formatLocal, parseLocal, scheduleInputSchema, summarize, toScheduleInput, toTrigger } from './schedule-input';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const now = at(2026, 10, 18, 14, 0);

describe('parseLocal / formatLocal', () => {
  test('round trip in local time', () => {
    expect(parseLocal('2026-10-20 08:00')).toBe(at(2026, 10, 20, 8));
    expect(parseLocal('2026-10-20T8:05')).toBe(at(2026, 10, 20, 8, 5));
    expect(formatLocal(at(2026, 10, 20, 8))).toBe('2026-10-20 08:00 周二');
  });
  test('rejects impossible dates', () => {
    expect(() => parseLocal('2026-02-30 08:00')).toThrow();
    expect(() => parseLocal('tomorrow')).toThrow();
  });
});

describe('toTrigger', () => {
  test('once', () => {
    expect(toTrigger({ type: 'once', at: '2026-10-20 14:00' }, now)).toEqual({ type: 'at', at: at(2026, 10, 20, 14) });
  });

  test('"every 3 days at 8, 16 times" defaults start to now', () => {
    const input = scheduleInputSchema.parse({ type: 'repeat', unit: 'day', interval: 3, times: ['08:00'], count: 16 });
    const t = toTrigger(input, now);
    expect(t).toMatchObject({ type: 'every', startAt: now, count: 16 });
    expect(toTrigger({ type: 'repeat', unit: 'minute', interval: 5 }, now + 12_345)).toMatchObject({ startAt: now });
    const s = summarize(t, now);
    expect(s.next).toEqual(['2026-10-21 08:00 周三', '2026-10-24 08:00 周六', '2026-10-27 08:00 周二']);
    expect(s.total).toBe(16);
    expect(s.schedule).toBe('每 3 天 08:00 · 共 16 次');
  });

  test('drops fields that do not apply to the unit', () => {
    const t = toTrigger({ type: 'repeat', unit: 'hour', interval: 2, times: ['08:00'], weekdays: [1] }, now);
    expect(t).toMatchObject({ times: undefined, weekdays: undefined });
  });

  test('round trips through toScheduleInput', () => {
    const t = toTrigger({ type: 'repeat', unit: 'week', interval: 1, weekdays: [1, 3], times: ['07:50'], start: '2026-10-19 00:00', until: '2026-12-31 23:59' }, now);
    expect(toTrigger(toScheduleInput(t), now)).toEqual(t);
  });

  test('summary of a finished one-shot', () => {
    expect(summarize({ type: 'at', at: now - 60_000 }, now)).toMatchObject({ next: [], finished: true, total: 1 });
  });
});
