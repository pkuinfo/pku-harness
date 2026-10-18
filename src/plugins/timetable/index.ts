import { z } from 'zod';

import { definePlugin, defineTool } from '@/core/runtime/types';
import { timeOfDay } from '@/core/scheduler/types';
import { classesOn, classStatus, formatWeeks, parseWeeks, weekOf, type Course } from '@/core/timetable/model';
import { timetable } from '@/core/timetable/store';

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const view = (c: Course) => ({
  id: c.id,
  name: c.name,
  weekday: WEEKDAY[c.weekday],
  time: `${c.start}-${c.end}`,
  location: c.location,
  teacher: c.teacher,
  weeks: formatWeeks(c.weeks),
});

const courseFields = {
  name: z.string().min(1),
  weekday: z.number().int().min(0).max(6).describe('0=Sunday … 6=Saturday'),
  start: timeOfDay,
  end: timeOfDay,
  location: z.string().optional(),
  teacher: z.string().optional(),
  weeks: z.string().optional().describe('teaching weeks, e.g. "1-16", "1-15单", "2-16双", "1,3,5"; default every week'),
};

/**
 * Class timetable. Courses are added by hand or by the agent today; the campus timetable sync
 * (pkucli treehole `get_coursetable`, T4.5) will fill the same store with source "campus".
 */
export const timetablePlugin = definePlugin({
  id: 'timetable',
  name: '课表',
  description: '课程表、今天的课和上课提醒。',
  version: '0.1.0',
  icon: 'book',
  core: true,
  scopes: [],
  instructions: '课表用 timetable 工具。用户口述课程时，逐门调用 timetable__addCourse（时间用 HH:MM，星期 0=周日）。上课提醒用 timetable__setReminder 设置提前分钟数。',
  dataSources: {
    today: { title: '今天的课', tool: 'today', ttlMs: 60_000 },
  },
  tools: {
    list: defineTool({
      title: '查看课表',
      description: 'All courses in the timetable.',
      input: z.object({}),
      effect: 'read',
      execute: async () => timetable.get().courses.map(view),
    }),
    today: defineTool({
      title: '今天的课',
      description: 'Classes on a day (default today) with status, and the next class.',
      input: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
      effect: 'read',
      execute: async ({ date }) => {
        const now = new Date();
        const day = date ? new Date(`${date}T00:00:00`) : now;
        const { courses, semester } = timetable.get();
        const list = classesOn(courses, day, semester).map((c) => ({ ...view(c), ...(date ? {} : classStatus(c, now)) }));
        const next = date ? null : (list.find((c) => 'state' in c && c.state !== 'after') ?? null);
        return { week: weekOf(semester, day), count: list.length, classes: list, next };
      },
    }),
    addCourse: defineTool({
      title: '添加课程',
      description: 'Add one weekly class meeting to the timetable.',
      input: z.object(courseFields),
      effect: 'write',
      execute: async (input) => {
        const c: Course = {
          id: timetable.newId(),
          name: input.name,
          weekday: input.weekday,
          start: input.start,
          end: input.end,
          location: input.location ?? null,
          teacher: input.teacher ?? null,
          weeks: input.weeks ? parseWeeks(input.weeks, timetable.get().semester?.weeks) : null,
          color: timetable.get().courses.length % 8,
          source: 'manual',
        };
        await timetable.upsert(c);
        return view(c);
      },
    }),
    updateCourse: defineTool({
      title: '修改课程',
      description: 'Change a course; only pass what changes.',
      input: z.object({ id: z.string(), ...z.object(courseFields).partial().shape }),
      effect: 'write',
      execute: async ({ id, weeks, location, teacher, ...rest }) => {
        const cur = timetable.get().courses.find((c) => c.id === id);
        if (!cur) throw new Error(`没有这门课：${id}`);
        const c: Course = {
          ...cur,
          ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
          location: location === undefined ? cur.location : location || null,
          teacher: teacher === undefined ? cur.teacher : teacher || null,
          weeks: weeks === undefined ? cur.weeks : weeks ? parseWeeks(weeks, timetable.get().semester?.weeks) : null,
        };
        await timetable.upsert(c);
        return view(c);
      },
    }),
    removeCourse: defineTool({
      title: '删除课程',
      description: 'Remove a course (and its class reminders).',
      input: z.object({ id: z.string() }),
      effect: 'write',
      execute: async ({ id }) => {
        const c = timetable.get().courses.find((x) => x.id === id);
        if (!c) throw new Error(`没有这门课：${id}`);
        await timetable.remove(id);
        return { removed: c.name };
      },
    }),
    setReminder: defineTool({
      title: '设置上课提醒',
      description: 'Remind before every class: minutes before start, or null to turn off.',
      input: z.object({ minutesBefore: z.number().int().min(0).max(180).nullable() }),
      effect: 'write',
      execute: async ({ minutesBefore }) => {
        await timetable.setReminderMinutes(minutesBefore);
        return { minutesBefore, courses: timetable.get().courses.length };
      },
    }),
  },
});
