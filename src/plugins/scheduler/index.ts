import { z } from 'zod';

import { registry } from '@/core/runtime/registry';
import { definePlugin, defineTool } from '@/core/runtime/types';
import { createJob, deleteJob, runCheck, updateJob } from '@/core/scheduler/engine';
import { formatLocal, scheduleInputSchema, summarize, toTrigger } from '@/core/scheduler/schedule-input';
import { jobStore } from '@/core/scheduler/store';
import { conditionSchema, type Action, type Job } from '@/core/scheduler/types';

const notifyAction = z.object({
  type: z.literal('notify'),
  title: z.string().optional().describe('notification title; default = job title'),
  body: z.string().optional(),
  url: z.string().optional().describe('in-app route to open on tap, e.g. "/schedule"'),
});

const checkAction = z.object({
  type: z.literal('check'),
  tool: z.string().describe('read-only tool id to call, e.g. "campus-card.getBalance"'),
  args: z.record(z.string(), z.unknown()).optional(),
  condition: conditionSchema.describe('notify only when this holds; path is a dot path into the tool result'),
  title: z.string().describe('notification title; "{value}" is replaced by the checked value'),
  body: z.string().optional(),
  url: z.string().optional(),
});

const actionInput = z.discriminatedUnion('type', [notifyAction, checkAction]);

function toAction(a: z.infer<typeof actionInput>, title: string): Action {
  if (a.type === 'notify') return { type: 'notify', title: a.title || title, body: a.body, url: a.url };
  const entry = registry.tool(a.tool);
  if (!entry) throw new Error(`没有这个工具：${a.tool}`);
  if (entry.def.effect !== 'read') throw new Error(`定时检查只能调用只读工具，${a.tool} 会产生修改`);
  return { ...a, condition: { ...a.condition, path: a.condition.path ?? '' } };
}

/** What tools return for a job: human schedule, next times, progress. */
export function jobView(job: Job) {
  const s = summarize(job.trigger);
  return {
    id: job.id,
    title: job.title,
    kind: job.action.type,
    enabled: job.enabled,
    schedule: s.schedule,
    next: job.enabled ? s.next : [],
    runs: job.runs,
    total: s.total,
    finished: s.finished,
    lastRunAt: job.lastRunAt ? formatLocal(job.lastRunAt) : null,
    lastError: job.lastError ?? null,
  };
}

export const schedulerPlugin = definePlugin({
  id: 'scheduler',
  name: '提醒与定时任务',
  description: '准时的本地提醒，以及定期检查数据（如余额）并在满足条件时通知。',
  version: '0.1.0',
  icon: 'alarm',
  core: true,
  scopes: [],
  instructions: `创建提醒或定时检查用 scheduler 工具。时间一律用本地时间字符串 "YYYY-MM-DD HH:mm"，根据系统提示里的当前时间换算"明天""两天后"等说法。
- 一次性：schedule { type: "once", at }。
- 重复：schedule { type: "repeat", unit: minute|hour|day|week, interval, times?: ["08:00"], weekdays?: [1,3,5], start?, count?, until? }。"每 3 天，共 16 次" = unit day, interval 3, count 16。
- 只是到点提醒用 action { type: "notify" }；需要先查数据再决定是否提醒（如"余额低于 100 提醒我"）用 action { type: "check", tool, condition: { path, op, value }, title }，tool 必须是只读工具。
- 创建后把返回的 schedule 和 next（接下来几次的时间）简短告诉用户，便于确认。不确定时间时先用 scheduler__preview 试算。`,
  tools: {
    create: defineTool({
      title: '创建提醒或定时任务',
      description: 'Create a reminder (notify) or a recurring data check (check). Returns the schedule and the next occurrences.',
      input: z.object({
        title: z.string().min(1).describe('short name shown in the Schedule tab'),
        schedule: scheduleInputSchema,
        action: actionInput.optional().describe('default: notify with the title'),
      }),
      effect: 'write',
      execute: async ({ title, schedule, action }, ctx) => {
        const job = await createJob({
          title,
          trigger: toTrigger(schedule),
          action: toAction(action ?? { type: 'notify' }, title),
          source: ctx.actor === 'agent' ? 'agent' : 'user',
        });
        return jobView(job);
      },
    }),
    update: defineTool({
      title: '修改定时任务',
      description: 'Change a job: title, schedule, action, or turn it on/off. Only pass what changes.',
      input: z.object({
        id: z.string(),
        title: z.string().optional(),
        schedule: scheduleInputSchema.optional(),
        action: actionInput.optional(),
        enabled: z.boolean().optional(),
      }),
      effect: 'write',
      execute: async ({ id, title, schedule, action, enabled }) => {
        const cur = jobStore.get(id);
        if (!cur) throw new Error(`没有这个任务：${id}`);
        const job = await updateJob(id, {
          title,
          enabled,
          trigger: schedule ? toTrigger(schedule) : undefined,
          action: action ? toAction(action, title ?? cur.title) : undefined,
        });
        return jobView(job);
      },
    }),
    delete: defineTool({
      title: '删除定时任务',
      description: 'Delete a job and cancel its pending notifications.',
      input: z.object({ id: z.string() }),
      effect: 'write',
      execute: async ({ id }) => {
        const job = jobStore.get(id);
        if (!job) throw new Error(`没有这个任务：${id}`);
        await deleteJob(id);
        return { deleted: job.title };
      },
    }),
    list: defineTool({
      title: '查看定时任务',
      description: 'List all reminders and scheduled checks with their next times.',
      input: z.object({ includeFinished: z.boolean().optional() }),
      effect: 'read',
      execute: async ({ includeFinished }) =>
        jobStore
          .list()
          .map(jobView)
          .filter((j) => includeFinished || !j.finished),
    }),
    preview: defineTool({
      title: '试算时间',
      description: 'Compute when a schedule would fire without creating anything.',
      input: z.object({ schedule: scheduleInputSchema, count: z.number().int().min(1).max(20).optional() }),
      effect: 'read',
      execute: async ({ schedule, count }) => summarize(toTrigger(schedule), Date.now(), count ?? 5),
    }),
    runCheck: defineTool({
      title: '立即执行检查',
      description: 'Run a check job now (calls its tool, evaluates the condition, notifies if it holds).',
      input: z.object({ id: z.string() }),
      effect: 'write',
      execute: async ({ id }) => {
        const job = jobStore.get(id);
        if (!job) throw new Error(`没有这个任务：${id}`);
        return runCheck(job);
      },
    }),
  },
});
