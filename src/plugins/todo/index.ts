import { z } from 'zod';

import { definePlugin, defineTool } from '@/core/runtime/types';
import { formatLocal, parseLocal, scheduleInputSchema, summarize, toTrigger } from '@/core/scheduler/schedule-input';
import { jobStore } from '@/core/scheduler/store';
import { addTodo, deleteTodo, setTodoDone, todoStore, updateTodo, type Todo } from '@/core/todo';

const view = (t: Todo) => {
  const job = t.jobId ? jobStore.get(t.jobId) : undefined;
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    due: t.dueAt ? formatLocal(t.dueAt) : null,
    done: !!t.doneAt,
    overdue: !t.doneAt && t.dueAt != null && t.dueAt < Date.now(),
    reminder: job ? summarize(job.trigger).schedule : null,
  };
};

const remindInput = z
  .union([
    z.object({ minutesBeforeDue: z.number().int().min(0).max(7 * 24 * 60) }),
    z.object({ schedule: scheduleInputSchema }),
  ])
  .nullable()
  .optional()
  .describe('reminder: minutes before the due time, or any schedule (repeating allowed); null removes it');

function toRemind(r: z.infer<typeof remindInput>, dueAt: number | null) {
  if (r === undefined) return undefined;
  if (r === null) return null;
  if ('schedule' in r) return toTrigger(r.schedule);
  if (dueAt == null) throw new Error('没有截止时间，无法按「提前 N 分钟」提醒');
  return { type: 'at' as const, at: dueAt - r.minutesBeforeDue * 60_000 };
}

export const todoPlugin = definePlugin({
  id: 'todo',
  name: '待办',
  description: '待办事项，可设截止时间和准时提醒。',
  version: '0.1.0',
  icon: 'todo',
  core: true,
  scopes: [],
  instructions: '待办用 todo 工具管理。截止时间用本地 "YYYY-MM-DD HH:mm"。需要提醒时传 remind（如截止前 30 分钟，或任意重复规则）。',
  dataSources: {
    open: { title: '未完成的待办', tool: 'list', ttlMs: 0 },
  },
  tools: {
    list: defineTool({
      title: '查看待办',
      description: 'List to-dos: open ones first (by due time), optionally including done ones.',
      input: z.object({ includeDone: z.boolean().optional() }),
      effect: 'read',
      execute: async ({ includeDone }) => todoStore.list().filter((t) => includeDone || !t.doneAt).map(view),
    }),
    add: defineTool({
      title: '添加待办',
      description: 'Add a to-do with optional notes, due time and reminder.',
      input: z.object({
        title: z.string().min(1),
        notes: z.string().optional(),
        due: z.string().optional().describe('local "YYYY-MM-DD HH:mm"'),
        remind: remindInput,
      }),
      effect: 'write',
      execute: async ({ title, notes, due, remind }, ctx) => {
        const dueAt = due ? parseLocal(due) : null;
        const todo = await addTodo({ title, notes, dueAt, remind: toRemind(remind, dueAt), source: ctx.actor === 'agent' ? 'agent' : 'user' });
        return view(todo);
      },
    }),
    update: defineTool({
      title: '修改待办',
      description: 'Change a to-do. Only pass what changes; due: null clears the due time.',
      input: z.object({
        id: z.string(),
        title: z.string().optional(),
        notes: z.string().nullable().optional(),
        due: z.string().nullable().optional(),
        remind: remindInput,
      }),
      effect: 'write',
      execute: async ({ id, title, notes, due, remind }, ctx) => {
        const cur = todoStore.get(id);
        if (!cur) throw new Error(`没有这个待办：${id}`);
        const dueAt = due === undefined ? cur.dueAt : due ? parseLocal(due) : null;
        const todo = await updateTodo(
          id,
          { title, notes, dueAt: due === undefined ? undefined : dueAt, remind: toRemind(remind, dueAt) },
          ctx.actor === 'agent' ? 'agent' : 'user',
        );
        return view(todo);
      },
    }),
    complete: defineTool({
      title: '完成待办',
      description: 'Mark a to-do done (or not done with done: false). Done pauses its reminder.',
      input: z.object({ id: z.string(), done: z.boolean().optional() }),
      effect: 'write',
      execute: async ({ id, done }) => view(await setTodoDone(id, done ?? true)),
    }),
    delete: defineTool({
      title: '删除待办',
      description: 'Delete a to-do and its reminder.',
      input: z.object({ id: z.string() }),
      effect: 'write',
      execute: async ({ id }) => {
        const t = todoStore.get(id);
        if (!t) throw new Error(`没有这个待办：${id}`);
        await deleteTodo(id);
        return { deleted: t.title };
      },
    }),
  },
});
