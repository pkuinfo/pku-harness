import { z } from 'zod';

import { describeTrigger, nextOccurrence, occurrencesAfter, totalOccurrences } from './recurrence';
import { timeOfDay, type Trigger } from './types';

/**
 * Model- and form-friendly schedule format: local "YYYY-MM-DD HH:mm" strings instead of epoch
 * ms, converted to a `Trigger`. Pure, so it is unit-tested.
 */

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2})?$/, 'use local "YYYY-MM-DD HH:mm"')
  .describe('local date-time "YYYY-MM-DD HH:mm"');

export const scheduleInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('once'),
    at: localDateTime,
  }),
  z.object({
    type: z.literal('repeat'),
    unit: z.enum(['minute', 'hour', 'day', 'week']),
    interval: z.number().int().min(1).describe('every N units, e.g. 3 for "every 3 days"'),
    times: z.array(timeOfDay).optional().describe('day/week: times of day, e.g. ["08:00","21:30"]'),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .optional()
      .describe('week: 0=Sunday … 6=Saturday'),
    start: localDateTime.optional().describe('first possible occurrence; default now'),
    count: z.number().int().min(1).optional().describe('stop after this many occurrences'),
    until: localDateTime.optional().describe('stop after this local date-time (inclusive)'),
  }),
]);

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export function parseLocal(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) throw new Error(`无法识别的时间：${s}`);
  const [, y, mo, d, h, mi, sec] = m.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, sec || 0);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) throw new Error(`不存在的日期：${s}`);
  return date.getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

/** "2026-10-20 08:00 周二" */
export function formatLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} 周${WEEKDAY[d.getDay()]}`;
}

export function toTrigger(input: ScheduleInput, now = Date.now()): Trigger {
  if (input.type === 'once') return { type: 'at', at: parseLocal(input.at) };
  return {
    type: 'every',
    unit: input.unit,
    interval: input.interval,
    times: input.unit === 'day' || input.unit === 'week' ? input.times : undefined,
    weekdays: input.unit === 'week' ? input.weekdays : undefined,
    // Default start: this minute, so series fire on whole minutes.
    startAt: input.start ? parseLocal(input.start) : Math.floor(now / 60_000) * 60_000,
    count: input.count,
    until: input.until ? parseLocal(input.until) : undefined,
  };
}

export function toScheduleInput(t: Trigger): ScheduleInput {
  if (t.type === 'at') return { type: 'once', at: formatLocal(t.at).slice(0, 16) };
  return {
    type: 'repeat',
    unit: t.unit,
    interval: t.interval,
    times: t.times,
    weekdays: t.weekdays,
    start: formatLocal(t.startAt).slice(0, 16),
    count: t.count,
    until: t.until != null ? formatLocal(t.until).slice(0, 16) : undefined,
  };
}

/** What the model (or a form) sees after creating or previewing a schedule. */
export function summarize(trigger: Trigger, now = Date.now(), n = 3) {
  const next = occurrencesAfter(trigger, now - 1, n).map((o) => formatLocal(o.at));
  return {
    schedule: describeTrigger(trigger, now),
    next,
    total: totalOccurrences(trigger),
    finished: nextOccurrence(trigger, now - 1) == null,
  };
}
