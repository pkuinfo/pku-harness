import * as BackgroundTask from 'expo-background-task';
import { AppState, Platform } from 'react-native';

import { live } from '@/core/dashboard/live-store';
import { cancelNotification, listScheduledNotifications, notifyAt, notifyNow } from '@/core/notify';
import { plainText } from '@/core/agent/session/session-utils';
import { invokeTool } from '@/core/runtime/invoke';
import { t } from '@/i18n';
import { registry } from '@/core/runtime/registry';

import { evaluate, fillTemplate, getPath, lastOccurrence, MAX_ACTIVE_JOBS, MAX_AGENT_JOBS, MAX_LATE_MS, MIN_AGENT_GAP_MS, MIN_CHECK_GAP_MS, minGap, nextOccurrence, recordRun, runsBy, runsInJs } from '@pku-harness/sdk';
import { runAgentJob } from './agent-run';
import { dismissWake, EventType, isWakeEvent, notifee, syncWakeups } from './exact-wake';
import { ANDROID_LIMITS, diffArmed, IOS_LIMITS, planNotifications } from './plan';
import { jobStore } from './store';
import { actionSchema, triggerSchema, type Job, type JobInput, type JobPatch } from '@pku-harness/sdk';

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

/**
 * Limits for unattended work (SDK scheduler/policy.ts), enforced here — the one place every job
 * is created or changed, whoever asks (agent, plugin, screen).
 */
function assertAllowed(job: Pick<Job, 'id' | 'enabled' | 'trigger' | 'action'>, now: number) {
  if (job.enabled && jobStore.list().filter((j) => j.enabled && j.id !== job.id).length >= MAX_ACTIVE_JOBS) {
    throw new Error(t('app.schedule.tooMany', { max: MAX_ACTIVE_JOBS }));
  }
  if (job.action.type === 'agent') {
    if (job.enabled && jobStore.list().filter((j) => j.enabled && j.id !== job.id && j.action.type === 'agent').length >= MAX_AGENT_JOBS) {
      throw new Error(t('app.schedule.tooManyAgent', { max: MAX_AGENT_JOBS }));
    }
    const gap = minGap(job.trigger, now);
    if (gap < MIN_AGENT_GAP_MS) throw new Error(t('app.schedule.agentTooOften', { minutes: MIN_AGENT_GAP_MS / 60_000, actual: Math.max(1, Math.round(gap / 60_000)) }));
    return;
  }
  if (job.action.type !== 'check') return;
  // The same check twice means two alerts for one event: point the caller at the existing job.
  const same = (o: Job['action']) => JSON.stringify(o.type === 'check' ? [o.tool, o.args ?? {}, o.condition] : null);
  const twin = jobStore.list().find((j) => j.id !== job.id && j.enabled && j.action.type === 'check' && same(j.action) === same(job.action));
  if (twin) throw new Error(t('app.schedule.duplicate', { title: twin.title, id: twin.id }));
  const effect = registry.tool(job.action.tool)?.def.effect;
  if (effect && effect !== 'read') throw new Error(t('app.schedule.readOnly', { tool: job.action.tool }));
  const gap = minGap(job.trigger, now);
  if (gap < MIN_CHECK_GAP_MS) {
    throw new Error(t('app.schedule.tooOften', { minutes: MIN_CHECK_GAP_MS / 60_000, actual: Math.max(1, Math.round(gap / 60_000)) }));
  }
}

export async function createJob(input: JobInput): Promise<Job> {
  const now = Date.now();
  const id = jobStore.newId();
  const trigger = triggerSchema.parse(input.trigger);
  const action = actionSchema.parse(input.action);
  assertAllowed({ id, enabled: input.enabled ?? true, trigger, action }, now);
  const job = derive(
    {
      id,
      title: input.title,
      trigger,
      action,
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
  if (!cur) throw new Error(t('app.schedule.noJob', { id }));
  const now = Date.now();
  const next: Job = {
    ...cur,
    ...patch,
    trigger: patch.trigger ? triggerSchema.parse(patch.trigger) : cur.trigger,
    action: patch.action ? actionSchema.parse(patch.action) : cur.action,
    // Ensure updatedAt changes even within the same millisecond, so notifications re-arm.
    updatedAt: Math.max(now, cur.updatedAt + 1),
  };
  assertAllowed(next, now);
  // A new schedule for a check job restarts its series.
  if (patch.trigger && runsInJs(next.action)) {
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

/**
 * Run one check job now and record the result (run log, failure policy). Unattended: it only
 * reads (re-checked here, not just at creation), never asks the user (invokeTool declines
 * `ask` for the scheduler), and tells the user when it keeps failing instead of failing quietly.
 */
export async function runCheck(job: Job, now = Date.now(), opts: { manual?: boolean } = {}): Promise<{ notified: boolean; value?: unknown; error?: string }> {
  if (!runsInJs(job.action)) throw new Error(t('app.schedule.notCheck'));
  const a = job.action;
  const started = Date.now();
  const scheduledAt = opts.manual ? null : job.nextRunAt;
  let outcome: { notified: boolean; value?: unknown; output?: string; error?: string };
  try {
    if (a.type === 'agent') {
      // A fresh, read-only, silent-by-default agent run (agent-run.ts).
      const { output, silent } = await runAgentJob(job);
      if (!silent) {
        await notifyNow({ title: job.title, body: plainText(output).slice(0, 240), url: `/m/schedule/reminder?id=${encodeURIComponent(job.id)}`, data: { jobId: job.id }, channel: 'alerts' });
      }
      outcome = { notified: !silent, output };
    } else if (a.type === 'check') {
      const effect = registry.tool(a.tool)?.def.effect;
      if (effect && effect !== 'read') throw new Error(t('app.schedule.readOnly', { tool: a.tool }));
      const result = await invokeTool(a.tool, a.args ?? {}, { actor: 'scheduler' });
      // Share the fresh result with dashboard widgets bound to the same source.
      if (effect === 'read') live.prime({ tool: a.tool, args: a.args }, result);
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
      outcome = { notified: hit, value };
    } else {
      outcome = { notified: false };
    }
  } catch (e) {
    outcome = { notified: false, error: e instanceof Error ? e.message : String(e) };
  }
  const run = { at: now, scheduledAt, ok: !outcome.error, notified: outcome.notified, value: outcome.value, output: outcome.output, error: outcome.error, ms: Date.now() - started, ...(opts.manual ? { manual: true } : {}) };
  const { patch, alert } = recordRun(job, run);
  // Advance even on failure so a broken check doesn't spin; the error is shown on the job.
  await jobStore.put({
    ...job,
    ...patch,
    runs: outcome.error ? job.runs : job.runs + 1,
    lastRunAt: now,
    ...(outcome.error ? { lastError: outcome.error } : { lastValue: outcome.value, lastError: undefined }),
    nextRunAt: nextOccurrence(job.trigger, now)?.at ?? null,
  });
  if (alert !== 'none') {
    const count = patch.failures ?? 0;
    await notifyNow({
      title: t(alert === 'disabled' ? 'app.schedule.disabledTitle' : 'app.schedule.failingTitle', { title: job.title }),
      body: alert === 'disabled' ? t('app.schedule.disabledBody', { count }) : t('app.schedule.failingBody', { count, error: outcome.error ?? '' }),
      data: { jobId: job.id },
      channel: 'alerts',
      // A problem report, not the thing the user asked to be told about: no Focus break-through.
      urgency: 'active',
    }).catch(() => {});
    if (alert === 'disabled') changed();
  }
  return outcome;
}

/** Run every enabled check job that is due. */
/**
 * Run every enabled check job that is due. Five callers can fire it at once (foreground timer,
 * wake event, app foreground, background task, headless wake), so runs are serialized and each
 * job is re-read just before it runs: an occurrence that already ran has moved `nextRunAt` on and
 * is not run twice. Missed occurrences collapse into the latest one; one older than
 * MAX_LATE_MS is logged as missed instead of alerting hours late (one-shots always run).
 */
let checking: Promise<number> = Promise.resolve(0);
export function runDueChecks(now = Date.now()): Promise<number> {
  checking = checking.then(() => runDueNow(now), () => runDueNow(now));
  return checking;
}

async function runDueNow(now: number): Promise<number> {
  const ids = jobStore.list().filter((j) => j.enabled && runsInJs(j.action) && j.nextRunAt != null && j.nextRunAt <= now).map((j) => j.id);
  let ran = 0;
  for (const id of ids) {
    const job = jobStore.get(id);
    if (!job || !job.enabled || job.nextRunAt == null || job.nextRunAt > now) continue;
    // The latest occurrence that is due (missed ones collapse into it).
    const latest = lastOccurrence(job.trigger, now)?.at ?? job.nextRunAt;
    if (job.trigger.type !== 'at' && now - latest > MAX_LATE_MS) {
      await recordMissed(job, latest, now);
      continue;
    }
    await runCheck({ ...job, nextRunAt: latest }, now);
    ran++;
  }
  return ran;
}

/** Log a run that was too late to be useful and move on to the next occurrence. */
async function recordMissed(job: Job, scheduledAt: number, now: number) {
  const { patch } = recordRun(job, { at: now, scheduledAt, ok: true, notified: false, ms: 0, missed: true });
  await jobStore.put({ ...job, history: patch.history, lastRunAt: now, nextRunAt: nextOccurrence(job.trigger, now)?.at ?? null });
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
  const desired = planNotifications(jobStore.list(), now, (n, total) => t('app.schedule.progress', { n, total }), Platform.OS === 'ios' ? IOS_LIMITS : ANDROID_LIMITS);
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
    const hasChecks = active.some((j) => runsInJs(j.action));
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
    .filter((j) => j.enabled && runsInJs(j.action) && j.nextRunAt != null)
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
