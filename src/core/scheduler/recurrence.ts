import type { Trigger } from './types';

/**
 * Recurrence engine (docs/ARCHITECTURE.md §8). Pure functions over device-local time, no
 * React Native imports, so it runs under `bun test`.
 *
 * A series is a sequence of periods (one minute/hour step, one day, or one week), each with
 * a fixed list of slots (times of day × weekdays). Slots before `startAt` are skipped; the
 * remaining slots are numbered 0, 1, 2… and `count` / `until` cut the series.
 */

export type Occurrence = { at: number; index: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_SCAN = 100_000;

type Every = Extract<Trigger, { type: 'every' }>;

export function parseTime(t: string): [number, number] {
  const [h, m] = t.split(':').map(Number);
  return [h, m];
}

export const formatTime = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** A periodic series compiled into constant-time period/slot arithmetic. */
type Series = {
  periodStart: (p: number) => number;
  /** Raw slot instants of period p, ascending (before skip/bounds filtering). */
  rawSlots: (p: number) => number[];
  approxLen: number;
  perPeriod: number;
  skipped: number;
  count?: number;
  until?: number;
};

function compile(t: Every): Series {
  const start = new Date(t.startAt);
  if (t.unit === 'minute' || t.unit === 'hour') {
    const step = t.interval * (t.unit === 'minute' ? MINUTE : HOUR);
    return {
      periodStart: (p) => t.startAt + p * step,
      rawSlots: (p) => [t.startAt + p * step],
      approxLen: step,
      perPeriod: 1,
      skipped: 0,
      count: t.count,
      until: t.until,
    };
  }

  const times = [...new Set(t.times ?? [formatTime(start.getHours(), start.getMinutes())])]
    .map(parseTime)
    .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  const y = start.getFullYear();
  const mo = start.getMonth();
  let d0: number;
  let dayOffsets: number[];
  let daysPerPeriod: number;
  if (t.unit === 'day') {
    d0 = start.getDate();
    dayOffsets = [0];
    daysPerPeriod = t.interval;
  } else {
    // Weeks start on Monday (China). Offsets are days from that Monday.
    d0 = start.getDate() - ((start.getDay() + 6) % 7);
    const weekdays = [...new Set(t.weekdays ?? [start.getDay()])];
    dayOffsets = weekdays.map((wd) => (wd + 6) % 7).sort((a, b) => a - b);
    daysPerPeriod = 7 * t.interval;
  }

  const rawSlots = (p: number) => {
    const out: number[] = [];
    for (const off of dayOffsets) {
      for (const [h, m] of times) out.push(new Date(y, mo, d0 + p * daysPerPeriod + off, h, m).getTime());
    }
    return out;
  };
  return {
    periodStart: (p) => new Date(y, mo, d0 + p * daysPerPeriod).getTime(),
    rawSlots,
    approxLen: daysPerPeriod * DAY,
    perPeriod: dayOffsets.length * times.length,
    skipped: rawSlots(0).filter((at) => at < t.startAt).length,
    count: t.count,
    until: t.until,
  };
}

/** Valid occurrences of period p (index ≥ 0, within count and until). */
function slotsOf(s: Series, p: number): Occurrence[] {
  if (p < 0) return [];
  return s
    .rawSlots(p)
    .map((at, i) => ({ at, index: p * s.perPeriod + i - s.skipped }))
    .filter((o) => o.index >= 0 && (s.count == null || o.index < s.count) && (s.until == null || o.at <= s.until));
}

/** Index of the period containing instant t (may be negative). */
function periodOf(s: Series, t: number): number {
  let p = Math.floor((t - s.periodStart(0)) / s.approxLen);
  while (s.periodStart(p) > t) p--;
  while (s.periodStart(p + 1) <= t) p++;
  return p;
}

/** Last period that can hold an occurrence, or Infinity for open series. */
function lastPeriod(s: Series): number {
  let last = Infinity;
  if (s.count != null) last = Math.floor((s.count - 1 + s.skipped) / s.perPeriod);
  if (s.until != null) last = Math.min(last, periodOf(s, s.until));
  return last;
}

/** First occurrence strictly after `after`, or null when the series is over. */
export function nextOccurrence(trigger: Trigger, after: number): Occurrence | null {
  if (trigger.type === 'at') return trigger.at > after ? { at: trigger.at, index: 0 } : null;
  const s = compile(trigger);
  const last = lastPeriod(s);
  for (let p = Math.max(0, periodOf(s, after)), n = 0; p <= last && n < MAX_SCAN; p++, n++) {
    const hit = slotsOf(s, p).find((o) => o.at > after);
    if (hit) return hit;
  }
  return null;
}

/** Up to `limit` occurrences strictly after `after`, optionally only those ≤ `before`. */
export function occurrencesAfter(trigger: Trigger, after: number, limit: number, before = Infinity): Occurrence[] {
  const out: Occurrence[] = [];
  let cursor = after;
  while (out.length < limit) {
    const next = nextOccurrence(trigger, cursor);
    if (!next || next.at > before) break;
    out.push(next);
    cursor = next.at;
  }
  return out;
}

/** Latest occurrence at or before t, or null. */
export function lastOccurrence(trigger: Trigger, t: number): Occurrence | null {
  if (trigger.type === 'at') return trigger.at <= t ? { at: trigger.at, index: 0 } : null;
  const s = compile(trigger);
  for (let p = Math.min(periodOf(s, t), lastPeriod(s)), n = 0; p >= 0 && n < MAX_SCAN; p--, n++) {
    const slots = slotsOf(s, p).filter((o) => o.at <= t);
    if (slots.length) return slots[slots.length - 1];
  }
  return null;
}

/** How many occurrences have happened by t. */
export function runsBy(trigger: Trigger, t: number): number {
  const last = lastOccurrence(trigger, t);
  return last ? last.index + 1 : 0;
}

/** Total occurrences of a bounded series, or null for an open-ended one. */
export function totalOccurrences(trigger: Trigger): number | null {
  if (trigger.type === 'at') return 1;
  // runsBy already respects `count`, since out-of-range slots are filtered.
  if (trigger.until != null) return runsBy(trigger, trigger.until);
  return trigger.count ?? null;
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

function formatDateTime(ms: number, now: number) {
  const d = new Date(ms);
  const n = new Date(now);
  const time = formatTime(d.getHours(), d.getMinutes());
  const sameYear = d.getFullYear() === n.getFullYear();
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) /
      DAY,
  );
  if (dayDiff === 0) return `今天 ${time}`;
  if (dayDiff === 1) return `明天 ${time}`;
  if (dayDiff === 2) return `后天 ${time}`;
  return `${sameYear ? '' : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

/** Short Chinese description, e.g. "每 3 天 08:00 · 共 16 次". */
export function describeTrigger(trigger: Trigger, now = Date.now()): string {
  if (trigger.type === 'at') return formatDateTime(trigger.at, now);
  const start = new Date(trigger.startAt);
  const times = (trigger.times ?? [formatTime(start.getHours(), start.getMinutes())]).join('、');
  let head: string;
  switch (trigger.unit) {
    case 'minute':
      head = `每 ${trigger.interval} 分钟`;
      break;
    case 'hour':
      head = trigger.interval === 1 ? '每小时' : `每 ${trigger.interval} 小时`;
      break;
    case 'day':
      head = `${trigger.interval === 1 ? '每天' : `每 ${trigger.interval} 天`} ${times}`;
      break;
    case 'week': {
      const days = [...(trigger.weekdays ?? [start.getDay()])]
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((w) => WEEKDAY[w])
        .join('、');
      head = `${trigger.interval === 1 ? '每周' : `每 ${trigger.interval} 周`}${days} ${times}`;
      break;
    }
  }
  const parts = [head];
  if (trigger.startAt > now) parts.push(`${formatDateTime(trigger.startAt, now)}起`);
  if (trigger.count != null) parts.push(`共 ${trigger.count} 次`);
  if (trigger.until != null) parts.push(`至 ${formatDateTime(trigger.until, now)}`);
  return parts.join(' · ');
}
