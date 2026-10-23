/**
 * First-run flow, as pure data and functions (unit-tested in flow.test.ts): the intro pages and
 * consent, then the setup steps. Progress is saved after every step (src/core/boot.ts
 * `onboardingProgress`) so a kill mid-setup resumes on the same step.
 */
import { deliveryBlocker, type NotifyReadiness } from '@/core/runtime/types';
import type { MessageKey } from '@/i18n';

/**
 * Setup order. New steps may be inserted (saved progress stores step names, so an older save
 * still resumes on its step); never rename one.
 */
export const SETUP_STEPS = ['ai', 'campus', 'plugins', 'permissions', 'done'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/** Steps with a progress segment (the finish screen is not a task). */
export const TASK_STEPS = ['ai', 'campus', 'plugins', 'permissions'] as const satisfies readonly SetupStep[];

export type StepOutcome = 'done' | 'skipped';

export type OnboardingProgress = {
  v: 1;
  /** The step to open on resume. */
  step: SetupStep;
  /** When the terms were accepted (setup only starts after consent). */
  consentAt: number;
  /** How each finished step ended, for the finish screen's summary. */
  outcomes: Partial<Record<SetupStep, StepOutcome>>;
};

export type Phase = { kind: 'intro' } | { kind: 'setup'; step: SetupStep };

const isStep = (s: unknown): s is SetupStep => typeof s === 'string' && (SETUP_STEPS as readonly string[]).includes(s);

/** Validate whatever was stored (older or corrupt values fall back to the intro). */
export function parseProgress(raw: unknown): OnboardingProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<OnboardingProgress>;
  if (r.v !== 1 || !isStep(r.step) || typeof r.consentAt !== 'number') return null;
  const outcomes: OnboardingProgress['outcomes'] = {};
  for (const [k, v] of Object.entries(r.outcomes ?? {})) {
    if (isStep(k) && (v === 'done' || v === 'skipped')) outcomes[k] = v;
  }
  return { v: 1, step: r.step, consentAt: r.consentAt, outcomes };
}

/** Where the welcome opens: the saved step after consent, otherwise the intro. */
export function resumePhase(raw: unknown): Phase {
  const p = parseProgress(raw);
  return p ? { kind: 'setup', step: p.step } : { kind: 'intro' };
}

/** Progress right after the terms are accepted. */
export function startSetup(now: number): OnboardingProgress {
  return { v: 1, step: SETUP_STEPS[0], consentAt: now, outcomes: {} };
}

export function nextStep(step: SetupStep): SetupStep {
  const i = SETUP_STEPS.indexOf(step);
  return SETUP_STEPS[Math.min(i + 1, SETUP_STEPS.length - 1)];
}

/** The step before, or null on the first one (back then returns to the intro). */
export function prevStep(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step);
  return i > 0 ? SETUP_STEPS[i - 1] : null;
}

/** Record how `step` ended and move on. */
export function advance(progress: OnboardingProgress, step: SetupStep, outcome: StepOutcome): OnboardingProgress {
  return { ...progress, step: nextStep(step), outcomes: { ...progress.outcomes, [step]: outcome } };
}

/** Go back one step (the outcome of the step we return to is kept until it ends again). */
export function retreat(progress: OnboardingProgress, step: SetupStep): OnboardingProgress {
  return { ...progress, step: prevStep(step) ?? step };
}

/** 1-based position among the task steps, for the progress indicator; null on the finish screen. */
export function stepPosition(step: SetupStep): { index: number; total: number } | null {
  const i = (TASK_STEPS as readonly SetupStep[]).indexOf(step);
  return i < 0 ? null : { index: i + 1, total: TASK_STEPS.length };
}

/**
 * How the reminders step ends: done once both required permissions (notifications, exact
 * alarms) are on; battery optimisation is only a recommendation.
 */
export function permissionsOutcome(r: NotifyReadiness): StepOutcome {
  return deliveryBlocker(r) ? 'skipped' : 'done';
}

/** The finish screen's reminders summary: on time, possibly late (no exact alarms), or off. */
export function remindersSummary(r: NotifyReadiness): 'onTime' | 'mayBeLate' | 'off' {
  const b = deliveryBlocker(r);
  return b === 'notifications' ? 'off' : b === 'exactAlarms' ? 'mayBeLate' : 'onTime';
}

export type SetupState = {
  /** An AI provider is ready to chat. */
  ai: boolean;
  /** Signed in to the campus account. */
  campus: boolean;
  /** Enabled plugin ids. */
  enabled: ReadonlySet<string>;
};

/**
 * Two or three first questions that work with what was just set up, as dictionary keys (the
 * finish screen translates them; the text goes into the composer in the app language). Without
 * an AI service there is nothing to ask yet.
 */
export function suggestionsFor(s: SetupState): MessageKey[] {
  if (!s.ai) return [];
  const out: MessageKey[] = [];
  const on = (id: string) => s.enabled.has(id);
  if (s.campus && on('wallet')) out.push('welcome.done.suggest.balance');
  if (s.campus && on('course-sync')) out.push('welcome.done.suggest.timetable');
  else if (s.campus && on('wallet')) out.push('welcome.done.suggest.netFee');
  if (s.campus && on('courses') && out.length < 3) out.push('welcome.done.suggest.homework');
  const general: MessageKey[] = ['welcome.done.suggest.week', 'welcome.done.suggest.remind', 'welcome.done.suggest.dashboard'];
  for (const g of general) {
    if (out.length >= 3) break;
    out.push(g);
  }
  return out.slice(0, 3);
}
