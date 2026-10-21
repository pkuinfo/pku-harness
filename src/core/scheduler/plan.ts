import { occurrencesAfter, totalOccurrences } from '@pku-harness/sdk';
import type { Job } from '@pku-harness/sdk';

/**
 * Which notifications should be armed with the OS right now. Pure, so it is unit-tested;
 * `engine.ts` diffs the result against what is actually scheduled.
 */

export type ArmedNotification = {
  /** Encodes job, version and occurrence, so edits re-arm and duplicates are impossible. */
  identifier: string;
  at: number;
  jobId: string;
  title: string;
  body?: string;
  url?: string;
};

export const ARM_PREFIX = 'job:';
/** How many notifications may be armed ahead (per platform). */
export type ArmLimits = { maxArmed: number; perJob: number };
/** Android caps alarms per app at 500; leave headroom for other modules. */
export const ANDROID_LIMITS: ArmLimits = { maxArmed: 400, perJob: 64 };
/**
 * iOS keeps only the 64 soonest pending local notifications per app and silently drops the rest;
 * leave room for immediate ones and the test notification.
 */
export const IOS_LIMITS: ArmLimits = { maxArmed: 56, perJob: 12 };
export const MAX_ARMED = ANDROID_LIMITS.maxArmed;
export const PER_JOB = ANDROID_LIMITS.perJob;
export const HORIZON_MS = 14 * 86_400_000;

export const armId = (job: Job, index: number) => `${ARM_PREFIX}${job.id}:${job.updatedAt}:${index}`;

/** "第 3/16 次" / "3 of 16": appended to a bounded series' notification body. Pure by default; the engine passes the app language. */
export type ProgressLabel = (n: number, total: number) => string;
const zhProgress: ProgressLabel = (n, total) => `第 ${n}/${total} 次`;

export function planNotifications(jobs: Job[], now: number, progressLabel: ProgressLabel = zhProgress, limits: ArmLimits = ANDROID_LIMITS): ArmedNotification[] {
  const out: ArmedNotification[] = [];
  const active = jobs.filter((j) => j.enabled && j.action.type === 'notify');
  // Fair share when the cap is tight (iOS): every job keeps its soonest occurrences, so one dense
  // series (a timetable) can't push everyone else's next reminder out. Later ones arm on later syncs.
  const perJob = Math.max(1, Math.min(limits.perJob, Math.floor(limits.maxArmed / Math.max(1, active.length))));
  for (const job of active) {
    if (job.action.type !== 'notify') continue;
    const total = totalOccurrences(job.trigger);
    for (const o of occurrencesAfter(job.trigger, now, perJob, now + HORIZON_MS)) {
      const progress = total != null && total > 1 ? progressLabel(o.index + 1, total) : undefined;
      out.push({
        identifier: armId(job, o.index),
        at: o.at,
        jobId: job.id,
        title: job.action.title,
        body: [job.action.body, progress].filter(Boolean).join(' · ') || undefined,
        url: job.action.url,
      });
    }
  }
  // Soonest first wins when over the cap; later ones are armed on the next sync.
  return out.sort((a, b) => a.at - b.at).slice(0, limits.maxArmed);
}

/** Diff desired against scheduled identifiers (only ours, by prefix). */
export function diffArmed(desired: ArmedNotification[], scheduled: string[]) {
  const want = new Set(desired.map((d) => d.identifier));
  const have = new Set(scheduled.filter((id) => id.startsWith(ARM_PREFIX)));
  return {
    cancel: [...have].filter((id) => !want.has(id)),
    schedule: desired.filter((d) => !have.has(d.identifier)),
  };
}
