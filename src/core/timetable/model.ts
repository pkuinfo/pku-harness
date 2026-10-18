import { parseTime, formatTime } from '@/core/scheduler/recurrence';
import type { Trigger } from '@/core/scheduler/types';

/** Pure timetable logic, unit-tested. Weekdays use JS numbering: 0 = Sunday … 6 = Saturday. */

export type Course = {
  id: string;
  name: string;
  location: string | null;
  teacher: string | null;
  weekday: number;
  start: string;
  end: string;
  /** Teaching weeks the course meets; null = every week. */
  weeks: number[] | null;
  /** Palette index for the colour chip. */
  color: number;
  source: 'manual' | 'campus';
};

export type Semester = { name: string; start: string; weeks: number };

const DAY = 86_400_000;

/**
 * Parse a weeks expression: "1-16", "1-16单", "2-16双", "1,3,5-8", "单周", "双周", "全部".
 * Returns null for "every week". Throws on garbage.
 */
export function parseWeeks(expr: string, total = 20): number[] | null {
  const s = expr.replace(/\s|周/g, '').replace(/，/g, ',');
  if (!s || s === '全部' || s === '每') return null;
  if (s === '单') return range(1, total).filter((w) => w % 2 === 1);
  if (s === '双') return range(1, total).filter((w) => w % 2 === 0);
  const out = new Set<number>();
  for (const part of s.split(',')) {
    const m = /^(\d+)(?:-(\d+))?(单|双)?$/.exec(part);
    if (!m) throw new Error(`无法识别的周次：${expr}`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let w = Math.min(a, b); w <= Math.max(a, b); w++) {
      if (m[3] === '单' && w % 2 === 0) continue;
      if (m[3] === '双' && w % 2 === 1) continue;
      out.add(w);
    }
  }
  return [...out].sort((x, y) => x - y);
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** "1-16", "1-15单", "2,5,9" — compact text for a weeks list. */
export function formatWeeks(weeks: number[] | null): string {
  if (!weeks || !weeks.length) return '每周';
  const p = weekPattern(weeks);
  if (p && p.step === 1) return `${p.first}-${p.last}周`;
  if (p && p.step === 2) return `${p.first}-${p.last}${p.first % 2 ? '单' : '双'}周`;
  return `${weeks.join(',')}周`;
}

/** Arithmetic pattern of a weeks list (contiguous = step 1, odd/even = step 2), else null. */
export function weekPattern(weeks: number[]): { first: number; last: number; step: number } | null {
  if (!weeks.length) return null;
  if (weeks.length === 1) return { first: weeks[0], last: weeks[0], step: 1 };
  const step = weeks[1] - weeks[0];
  for (let i = 2; i < weeks.length; i++) if (weeks[i] - weeks[i - 1] !== step) return null;
  return { first: weeks[0], last: weeks[weeks.length - 1], step };
}

function mondayOf(sem: Semester): Date {
  const [y, m, d] = sem.start.split('-').map(Number);
  const s = new Date(y, m - 1, d);
  return new Date(y, m - 1, d - ((s.getDay() + 6) % 7));
}

/** Teaching week (1-based) of a date, or null without a semester. */
export function weekOf(sem: Semester | null, date: Date): number | null {
  if (!sem) return null;
  const mon = mondayOf(sem);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(Math.round((day.getTime() - mon.getTime()) / DAY) / 7) + 1;
}

/** Local date of a weekday in a given teaching week. */
export function dateOfWeek(sem: Semester, week: number, weekday: number): Date {
  const mon = mondayOf(sem);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + (week - 1) * 7 + ((weekday + 6) % 7));
}

/** Courses meeting on a date, sorted by start time. */
export function classesOn(courses: Course[], date: Date, sem: Semester | null): Course[] {
  const week = weekOf(sem, date);
  return courses
    .filter((c) => c.weekday === date.getDay())
    .filter((c) => !c.weeks || week == null || c.weeks.includes(week))
    .filter((c) => !sem || week == null || (week >= 1 && week <= sem.weeks))
    .sort((a, b) => a.start.localeCompare(b.start));
}

const minutes = (t: string) => {
  const [h, m] = parseTime(t);
  return h * 60 + m;
};

/** Status of a class at `now` on its day: before / ongoing (with progress) / after. */
export function classStatus(c: Course, now: Date): { state: 'before' | 'ongoing' | 'after'; progress: number; minutesToStart: number } {
  const n = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const s = minutes(c.start);
  const e = minutes(c.end);
  if (n < s) return { state: 'before', progress: 0, minutesToStart: Math.ceil(s - n) };
  if (n < e) return { state: 'ongoing', progress: (n - s) / (e - s), minutesToStart: 0 };
  return { state: 'after', progress: 1, minutesToStart: 0 };
}

/**
 * Weekly reminder trigger for a course, `minutesBefore` its start. With a semester, the series
 * runs from its first to its last teaching week (step 2 for odd/even weeks); irregular week
 * lists use the full span. Without a semester it repeats weekly from now.
 */
export function courseReminderTrigger(c: Course, minutesBefore: number, sem: Semester | null, now = Date.now()): Trigger {
  const at = Math.max(0, minutes(c.start) - minutesBefore);
  const time = formatTime(Math.floor(at / 60), at % 60);
  if (!sem) {
    return { type: 'every', unit: 'week', interval: 1, weekdays: [c.weekday], times: [time], startAt: now };
  }
  const weeks = c.weeks?.length ? c.weeks : range(1, sem.weeks);
  const p = weekPattern(weeks) ?? { first: weeks[0], last: weeks[weeks.length - 1], step: 1 };
  const first = dateOfWeek(sem, p.first, c.weekday);
  const last = dateOfWeek(sem, p.last, c.weekday);
  const [h, m] = parseTime(time);
  return {
    type: 'every',
    unit: 'week',
    interval: p.step,
    weekdays: [c.weekday],
    times: [time],
    // Start on the Monday of the first week so the step-2 cadence aligns with that week.
    startAt: new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((c.weekday + 6) % 7)).getTime(),
    until: new Date(last.getFullYear(), last.getMonth(), last.getDate(), h, m).getTime(),
  };
}
