import * as BackgroundTask from 'expo-background-task';
import { AppState } from 'react-native';

import { live } from '@/core/dashboard/live-store';
import { cancelNotification, listScheduledNotifications, notifyAt, notifyNow } from '@/core/notify';
import { invokeTool } from '@/core/runtime/invoke';
import { registry } from '@/core/runtime/registry';

import { evaluate, fillTemplate, getPath } from './check';
import { dismissWake, EventType, isWakeEvent, notifee, syncWakeups } from './exact-wake';
import { diffArmed, planNotifications } from './plan';
import { lastOccurrence, nextOccurrence, runsBy } from './recurrence';
import { jobStore } from './store';
import { actionSchema, triggerSchema, type Job, type JobInput, type JobPatch } from './types';

/**
 * Scheduler engine (docs/ARCHITECTURE.md §8).
 * - `notify` jobs: occurrences are armed ahead of time as exact local notifications, so they
 *   fire on the minute even when the app is dead. `sync()` re-arms on start, on change, on
 *   foreground and from the background task.
 * - `check` jobs: run in JS. In the foreground a timer fires them at the exact minute; in the
 *   background `expo-background-task` runs whatever is due (inexact, ≥ 15 min on Android).
 */

export const BACKGROUND_TASK = 'harness-scheduler';

/** Recompute runs / lastRunAt / nextRunAt from the trigger. */
function derive(job: Job, now: number): Job {
  if (job.action.type === 'notify') {
    return {
      ...job,
      runs: runsBy(job.trigger, now),
      lastRunAt: lastOccurrence(job.trigger, now)?.at ?? null,
      nextRunAt: nextOccurrence(job.trigger, now)?.at ?? null,
    };
  }
  // Check jobs count real executions; the next run is the first occurrence after the last one.
  const from = job.lastRunAt ?? job.createdAt - 1;
  return { ...job, nextRunAt: nextOccurrence(job.trigger, from)?.at ?? null };
}

export async function createJob(input: JobInput): Promise<Job> {
  const now = Date.now();
  const job = derive(
    {
      id: jobStore.newId(),
      title: input.title,
      trigger: triggerSchema.parse(input.trigger),
      action: actionSchema.parse(input.action),
      enabled: input.enabled ?? true,
      source: input.source,
      meta: input.meta,
      runs: 0,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: now,
      updatedAt: now,
    },
    now,
  );
  await jobStore.put(job);
  changed();
  return job;
}

export async function updateJob(
  id: string,
  patch: JobPatch,
): Promise<Job> {
  const cur = jobStore.get(id);
  if (!cur) throw new Error(`没有这个任务：${id}`);
  const now = Date.now();
  const next: Job = {
    ...cur,
    ...patch,
    trigger: patch.trigger ? triggerSchema.parse(patch.trigger) : cur.trigger,
    action: patch.action ? actionSchema.parse(patch.action) : cur.action,
    // Ensure updatedAt changes even within the same millisecond, so notifications re-arm.
    updatedAt: Math.max(now, cur.updatedAt + 1),
  };
  // A new schedule for a check job restarts its series.
  if (patch.trigger && next.action.type === 'check') {
    next.lastRunAt = null;
    next.createdAt = now;
  }
  const job = derive(next, now);
  await jobStore.put(job);
  changed();
  return job;
}

export async function deleteJob(id: string) {
  await jobStore.remove(id);
  changed();
}

/** Run one check job now and record the result. Returns whether it notified. */
export async function runCheck(job: Job, now = Date.now()): Promise<{ notified: boolean; value?: unknown; error?: string }> {
  if (job.action.type !== 'check') throw new Error('不是检查任务');
  const a = job.action;
  try {
    const result = await invokeTool(a.tool, a.args ?? {}, { actor: 'scheduler' });
    // Share the fresh result with dashboard widgets bound to the same source.
    if (registry.tool(a.tool)?.def.effect === 'read') live.prime({ tool: a.tool, args: a.args }, result);
    const value = getPath(result, a.condition.path);
    const hit = evaluate(a.condition, value, job.lastValue);
    if (hit) {
      await notifyNow({
        title: fillTemplate(a.title, value),
        body: a.body ? fillTemplate(a.body, value) : undefined,
        url: a.url,
        data: { jobId: job.id },
        channel: 'alerts',
      });
    }
    await jobStore.put({
      ...job,
      runs: job.runs + 1,
      lastRunAt: now,
      lastValue: value,
      lastError: undefined,
      nextRunAt: nextOccurrence(job.trigger, now)?.at ?? null,
    });
    return { notified: hit, value };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // Advance anyway so a broken check doesn't spin; the error is shown on the job.
    await jobStore.put({ ...job, lastError: error, lastRunAt: now, nextRunAt: nextOccurrence(job.trigger, now)?.at ?? null });
    return { notified: false, error };
  }
}

/** Run every enabled check job that is due. */
export async function runDueChecks(now = Date.now()) {
  const due = jobStore.list().filter((j) => j.enabled && j.action.type === 'check' && j.nextRunAt != null && j.nextRunAt <= now);
  for (const job of due) await runCheck(job, now);
  return due.length;
}

let syncing: Promise<void> = Promise.resolve();

/** Make the OS's scheduled notifications match the jobs. Serialized. */
export function sync(): Promise<void> {
  syncing = syncing.then(syncNow, syncNow);
  return syncing;
}

async function syncNow() {
  const now = Date.now();
  // Refresh derived fields so lists show the right "next" time.
  for (const job of jobStore.list()) {
    const d = derive(job, now);
    if (d.nextRunAt !== job.nextRunAt || d.runs !== job.runs) await jobStore.put(d);
  }
  const desired = planNotifications(jobStore.list(), now);
  const scheduled = (await listScheduledNotifications()).map((n) => n.identifier);
  const { cancel, schedule } = diffArmed(desired, scheduled);
  for (const id of cancel) await cancelNotification(id);
  for (const n of schedule) {
    await notifyAt(new Date(n.at), { title: n.title, body: n.body, url: n.url, data: { jobId: n.jobId } }, n.identifier);
  }
  await syncWakeups(jobStore.list()).catch((e) => console.warn('exact wake-ups failed', e));
  await ensureBackgroundTask();
}

async function ensureBackgroundTask() {
  const active = jobStore.list().filter((j) => j.enabled && j.nextRunAt != null);
  try {
    if (!active.length) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK).catch(() => {});
      return;
    }
    // Check jobs need frequent wakeups; notify-only series just need periodic re-arming.
    const hasChecks = active.some((j) => j.action.type === 'check');
    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK, { minimumInterval: hasChecks ? 15 : 12 * 60 });
  } catch (e) {
    console.warn('background task registration failed', e);
  }
}

// Foreground ticker: fire check jobs at their exact minute while the app is open.
let timer: ReturnType<typeof setTimeout> | null = null;
const MAX_DELAY = 6 * 60 * 60_000;

function scheduleTick() {
  if (timer) clearTimeout(timer);
  timer = null;
  const next = jobStore
    .list()
    .filter((j) => j.enabled && j.action.type === 'check' && j.nextRunAt != null)
    .reduce<number | null>((min, j) => (min == null || j.nextRunAt! < min ? j.nextRunAt! : min), null);
  if (next == null) return;
  timer = setTimeout(
    async () => {
      await runDueChecks();
      scheduleTick();
    },
    Math.min(Math.max(0, next - Date.now()), MAX_DELAY),
  );
}

function changed() {
  sync().catch((e) => console.warn('scheduler sync failed', e));
  scheduleTick();
}

let started = false;

/** Called once from boot() in the app (not in the background task). */
export async function startScheduler() {
  if (started) return;
  started = true;
  if (!jobStore.isLoaded()) await jobStore.load();
  await runDueChecks();
  changed();
  // A wake trigger firing while the app is open: the foreground timer usually got there first,
  // so just make sure checks ran and remove the placeholder.
  notifee.onForegroundEvent(async (e) => {
    if (e.type !== EventType.DELIVERED || !isWakeEvent(e)) return;
    await runDueChecks();
    await dismissWake(e);
    changed();
  });
  AppState.addEventListener('change', async (s) => {
    if (s !== 'active') return;
    await runDueChecks();
    changed();
  });
}
