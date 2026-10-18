/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import {
  describeTrigger,
  lastOccurrence,
  nextOccurrence,
  occurrencesAfter,
  runsBy,
  totalOccurrences,
} from './recurrence';
import type { Trigger } from './types';

// Local-time constructors keep the tests independent of the machine's time zone.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const fmt = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const list = (t: Trigger, after: number, n: number) => occurrencesAfter(t, after, n).map((o) => fmt(o.at));

describe('one-shot', () => {
  const t: Trigger = { type: 'at', at: at(2026, 10, 20, 9, 30) };

  test('fires once, in the future only', () => {
    expect(nextOccurrence(t, at(2026, 10, 18))).toEqual({ at: t.at, index: 0 });
    expect(nextOccurrence(t, t.at)).toBeNull();
    expect(list(t, 0, 5)).toEqual(['2026-10-20 09:30']);
  });

  test('runs and totals', () => {
    expect(runsBy(t, t.at - 1)).toBe(0);
    expect(runsBy(t, t.at)).toBe(1);
    expect(totalOccurrences(t)).toBe(1);
  });

  test('"in 2 days" from now', () => {
    const now = at(2026, 10, 18, 14, 5);
    const inTwoDays: Trigger = { type: 'at', at: now + 2 * 86_400_000 };
    expect(fmt(nextOccurrence(inTwoDays, now)!.at)).toBe('2026-10-20 14:05');
  });
});

describe('daily times', () => {
  const morningEvening: Trigger = {
    type: 'every',
    unit: 'day',
    interval: 1,
    times: ['20:30', '08:00'],
    startAt: at(2026, 10, 18, 12, 0),
  };

  test('skips slots before startAt and sorts times', () => {
    expect(list(morningEvening, at(2026, 10, 18, 12, 0), 5)).toEqual([
      '2026-10-18 20:30',
      '2026-10-19 08:00',
      '2026-10-19 20:30',
      '2026-10-20 08:00',
      '2026-10-20 20:30',
    ]);
  });

  test('indices count from the first real occurrence', () => {
    expect(nextOccurrence(morningEvening, 0)).toEqual({ at: at(2026, 10, 18, 20, 30), index: 0 });
    expect(nextOccurrence(morningEvening, at(2026, 10, 19, 9))!.index).toBe(2);
  });

  test('crosses month and year boundaries', () => {
    const t: Trigger = { type: 'every', unit: 'day', interval: 1, times: ['07:00'], startAt: at(2026, 12, 30) };
    expect(list(t, 0, 4)).toEqual(['2026-12-30 07:00', '2026-12-31 07:00', '2027-01-01 07:00', '2027-01-02 07:00']);
  });

  test('default time is the time of startAt', () => {
    const t: Trigger = { type: 'every', unit: 'day', interval: 1, startAt: at(2026, 10, 18, 22, 15) };
    expect(list(t, 0, 2)).toEqual(['2026-10-18 22:15', '2026-10-19 22:15']);
  });

  test('jumps far ahead without scanning from the start', () => {
    const t: Trigger = { type: 'every', unit: 'day', interval: 1, times: ['08:00'], startAt: at(2026, 1, 1) };
    const next = nextOccurrence(t, at(2036, 6, 15, 9))!;
    expect(fmt(next.at)).toBe('2036-06-16 08:00');
    expect(runsBy(t, at(2026, 1, 10, 8))).toBe(10);
  });
});

describe('every N days', () => {
  const every3: Trigger = { type: 'every', unit: 'day', interval: 3, times: ['09:00'], startAt: at(2026, 10, 18, 9) };

  test('steps by N days from the anchor day', () => {
    expect(list(every3, 0, 4)).toEqual(['2026-10-18 09:00', '2026-10-21 09:00', '2026-10-24 09:00', '2026-10-27 09:00']);
  });

  test('a later anchor time on the first day still counts that day', () => {
    const t: Trigger = { ...every3, startAt: at(2026, 10, 18, 8, 59) };
    expect(list(t, 0, 1)).toEqual(['2026-10-18 09:00']);
  });

  test('if the first slot has passed, the series starts at the next period', () => {
    const t: Trigger = { ...every3, startAt: at(2026, 10, 18, 9, 1) };
    expect(list(t, 0, 2)).toEqual(['2026-10-21 09:00', '2026-10-24 09:00']);
  });
});

describe('count', () => {
  // "every 3 days, 16 times, then stop"
  const t: Trigger = { type: 'every', unit: 'day', interval: 3, times: ['08:00'], startAt: at(2026, 10, 18), count: 16 };

  test('stops after exactly count occurrences', () => {
    const all = occurrencesAfter(t, 0, 100);
    expect(all).toHaveLength(16);
    expect(all[15]).toEqual({ at: at(2026, 12, 2, 8), index: 15 });
    expect(nextOccurrence(t, all[15].at)).toBeNull();
    expect(totalOccurrences(t)).toBe(16);
  });

  test('runs and last occurrence', () => {
    expect(runsBy(t, at(2026, 10, 18, 7, 59))).toBe(0);
    expect(runsBy(t, at(2026, 10, 24, 8))).toBe(3);
    expect(runsBy(t, at(2030, 1, 1))).toBe(16);
    expect(fmt(lastOccurrence(t, at(2030, 1, 1))!.at)).toBe('2026-12-02 08:00');
  });

  test('count covers every slot, not every day', () => {
    const twice: Trigger = { type: 'every', unit: 'day', interval: 1, times: ['08:00', '20:00'], startAt: at(2026, 10, 18, 12), count: 3 };
    expect(list(twice, 0, 10)).toEqual(['2026-10-18 20:00', '2026-10-19 08:00', '2026-10-19 20:00']);
  });
});

describe('until', () => {
  const t: Trigger = {
    type: 'every',
    unit: 'day',
    interval: 2,
    times: ['21:00'],
    startAt: at(2026, 10, 18),
    until: at(2026, 10, 24, 21),
  };

  test('is inclusive', () => {
    expect(list(t, 0, 10)).toEqual(['2026-10-18 21:00', '2026-10-20 21:00', '2026-10-22 21:00', '2026-10-24 21:00']);
    expect(totalOccurrences(t)).toBe(4);
    expect(runsBy(t, at(2027, 1, 1))).toBe(4);
  });

  test('count and until together: whichever ends first', () => {
    expect(occurrencesAfter({ ...t, count: 2 }, 0, 10)).toHaveLength(2);
    expect(occurrencesAfter({ ...t, count: 99 }, 0, 10)).toHaveLength(4);
  });

  test('open-ended series has no total', () => {
    expect(totalOccurrences({ ...t, until: undefined })).toBeNull();
  });
});

describe('weekly', () => {
  // 2026-10-18 is a Sunday.
  const t: Trigger = {
    type: 'every',
    unit: 'week',
    interval: 1,
    weekdays: [1, 3, 5],
    times: ['07:50'],
    startAt: at(2026, 10, 18),
  };

  test('Mon/Wed/Fri', () => {
    expect(list(t, 0, 4)).toEqual(['2026-10-19 07:50', '2026-10-21 07:50', '2026-10-23 07:50', '2026-10-26 07:50']);
  });

  test('every other week, Sunday is the end of the week', () => {
    const biweekly: Trigger = { ...t, interval: 2, weekdays: [0, 2] };
    // Week of Mon 10-12: Sun 10-18 is in it (startAt 00:00 ≤ 07:50). Next period: week of 10-26.
    expect(list(biweekly, 0, 4)).toEqual(['2026-10-18 07:50', '2026-10-27 07:50', '2026-11-01 07:50', '2026-11-10 07:50']);
  });
});

describe('minutes and hours', () => {
  test('every 90 minutes with count', () => {
    const t: Trigger = { type: 'every', unit: 'minute', interval: 90, startAt: at(2026, 10, 18, 8), count: 3 };
    expect(list(t, 0, 10)).toEqual(['2026-10-18 08:00', '2026-10-18 09:30', '2026-10-18 11:00']);
  });

  test('hourly, resumes from any point', () => {
    const t: Trigger = { type: 'every', unit: 'hour', interval: 1, startAt: at(2026, 10, 18, 8) };
    expect(nextOccurrence(t, at(2026, 10, 18, 10, 30))).toEqual({ at: at(2026, 10, 18, 11), index: 3 });
    expect(nextOccurrence(t, at(2026, 10, 18, 11))!.index).toBe(4);
    expect(runsBy(t, at(2026, 10, 18, 7))).toBe(0);
  });
});

describe('describeTrigger', () => {
  const now = at(2026, 10, 18, 10);
  test('one-shot relative day names', () => {
    expect(describeTrigger({ type: 'at', at: at(2026, 10, 18, 20) }, now)).toBe('今天 20:00');
    expect(describeTrigger({ type: 'at', at: at(2026, 10, 20, 8, 5) }, now)).toBe('后天 08:05');
    expect(describeTrigger({ type: 'at', at: at(2026, 11, 2, 8) }, now)).toBe('11月2日 08:00');
  });
  test('series', () => {
    expect(
      describeTrigger({ type: 'every', unit: 'day', interval: 3, times: ['08:00'], startAt: at(2026, 10, 19), count: 16 }, now),
    ).toBe('每 3 天 08:00 · 明天 00:00起 · 共 16 次');
    expect(describeTrigger({ type: 'every', unit: 'week', interval: 1, weekdays: [5, 1], times: ['07:50'], startAt: now }, now)).toBe(
      '每周一、五 07:50',
    );
  });
});
