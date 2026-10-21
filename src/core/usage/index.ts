/**
 * CONTRACT (owned by the usage agent; docs/AGENT-HARNESS.md §6). `recordStep` writes one row per
 * model request into the `usage` table (migration 3); screens read aggregates via `./hooks`.
 */
import { insertStep, loadLatestReports, type ChatReport } from './store';
import type { UsageStep } from './types';

export type { ToolCallUsage, UsagePurpose, UsageStep } from './types';
export type { ChatReport } from './store';

const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // A listener must never break recording.
    }
  });
}

/** Change feed for usage data (new rows, hydrated reports). */
export const usageEvents = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  version: () => version,
};

/** Latest provider-reported 'chat' request per session, kept in memory for the context meter. */
const reports = new Map<string, ChatReport>();
let hydrating: Promise<void> | null = null;

function hydrate() {
  hydrating ??= loadLatestReports()
    .then((loaded) => {
      for (const [id, r] of loaded) {
        const cur = reports.get(id);
        if (!cur || cur.at < r.at) reports.set(id, r);
      }
      emit();
    })
    .catch(() => {
      hydrating = null;
    });
}

/** Last provider-reported prompt size for a session (the latest 'chat' step), if known. */
export function lastReport(sessionId: string): ChatReport | undefined {
  hydrate();
  return reports.get(sessionId);
}

/** Record a model request. Never throws (usage must not break a reply). */
export function recordStep(step: UsageStep): void {
  try {
    if (step.purpose === 'chat' && step.inputTokens > 0) {
      const cur = reports.get(step.sessionId);
      if (!cur || cur.at <= step.at) reports.set(step.sessionId, { inputTokens: step.inputTokens, outputTokens: step.outputTokens, at: step.at });
    }
    insertStep(step)
      .catch(() => {})
      .finally(emit);
  } catch {
    // Swallowed by contract.
  }
}
