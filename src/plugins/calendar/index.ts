import { z } from 'zod';

import { definePlugin, defineTool } from '@/core/runtime/types';
import { formatLocal } from '@/core/scheduler/schedule-input';
import { timetable } from '@/core/timetable/store';

type Semester = { name: string; start: string; weeks: number };

const DAY = 86_400_000;
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** Week number (1-based) of `now` in a semester whose week 1 starts on the Monday of `start`. */
export function semesterWeek(sem: Semester, now: Date) {
  const [y, m, d] = sem.start.split('-').map(Number);
  const s = new Date(y, m - 1, d);
  const monday = new Date(y, m - 1, d - ((s.getDay() + 6) % 7));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - monday.getTime()) / DAY);
  const week = Math.floor(days / 7) + 1;
  return { week, inSemester: week >= 1 && week <= sem.weeks, daysLeft: Math.max(0, sem.weeks * 7 - days - 1) };
}

/**
 * Today and the academic calendar. Semester dates are set by the user or the agent (later
 * synced from the campus calendar plugin), never guessed.
 */
export const calendarPlugin = definePlugin({
  id: 'calendar',
  name: '日期与校历',
  description: '今天的日期、星期，以及当前是本学期第几周。',
  version: '0.1.0',
  icon: 'schedule',
  core: true,
  scopes: [],
  instructions: '学期起始日期未设置时，calendar__today 的 semester 为 null；不要猜测校历，可以请用户告诉你开学日期后用 calendar__setSemester 保存。',
  dataSources: {
    today: { title: '今天 / 教学周', tool: 'today', ttlMs: 30 * 60_000 },
  },
  tools: {
    today: defineTool({
      title: '今天',
      description: 'Today\'s date, weekday and the current teaching week of the semester (if configured).',
      input: z.object({}),
      effect: 'read',
      execute: async (_input, ctx) => {
        const now = new Date();
        const sem = await ctx.kv.get<Semester>('semester');
        const w = sem ? semesterWeek(sem, now) : null;
        return {
          date: formatLocal(now.getTime()).slice(0, 10),
          month: now.getMonth() + 1,
          day: now.getDate(),
          weekday: WEEKDAY[now.getDay()],
          semester: sem && w ? { name: sem.name, week: w.week, totalWeeks: sem.weeks, inSemester: w.inSemester, daysLeft: w.daysLeft } : null,
        };
      },
    }),
    setSemester: defineTool({
      title: '设置学期',
      description: 'Save the current semester: first day of week 1 and the number of teaching weeks.',
      input: z.object({
        name: z.string().describe('e.g. "2026 秋季学期"'),
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('first day of week 1, YYYY-MM-DD'),
        weeks: z.number().int().min(1).max(30),
      }),
      effect: 'write',
      execute: async (input, ctx) => {
        await ctx.kv.set('semester', input);
        await timetable.reloadSemester();
        return { saved: input, ...semesterWeek(input, new Date()) };
      },
    }),
  },
});
