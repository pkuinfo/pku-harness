import { occurrencesAfter, totalOccurrences } from './recurrence';
import type { Job } from './types';

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
/** Android caps alarms per app at 500; leave headroom for other modules. */
export const MAX_ARMED = 400;
export const PER_JOB = 64;
export const HORIZON_MS = 14 * 86_400_000;

export const armId = (job: Job, index: number) => `${ARM_PREFIX}${job.id}:${job.updatedAt}:${index}`;

export function planNotifications(jobs: Job[], now: number): ArmedNotification[] {
  const out: ArmedNotification[] = [];
  for (const job of jobs) {
    if (!job.enabled || job.action.type !== 'notify') continue;
    const total = totalOccurrences(job.trigger);
    for (const o of occurrencesAfter(job.trigger, now, PER_JOB, now + HORIZON_MS)) {
      const progress = total != null && total > 1 ? `第 ${o.index + 1}/${total} 次` : undefined;
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
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_ARMED);
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
