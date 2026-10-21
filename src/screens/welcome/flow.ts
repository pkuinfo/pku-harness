/**
 * First-run flow, as pure data and functions (unit-tested in flow.test.ts): the intro pages and
 * consent, then the setup steps. Progress is saved after every step (src/core/boot.ts
 * `onboardingProgress`) so a kill mid-setup resumes on the same step.
 */

export const SETUP_STEPS = ['ai', 'campus', 'plugins', 'done'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/** Steps with a progress segment (the finish screen is not a task). */
export const TASK_STEPS = ['ai', 'campus', 'plugins'] as const satisfies readonly SetupStep[];

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

export type SetupState = {
  /** An AI provider is ready to chat. */
  ai: boolean;
  /** Signed in to the campus account. */
  campus: boolean;
  /** Enabled plugin ids. */
  enabled: ReadonlySet<string>;
};

/**
 * Two or three first questions that work with what was just set up. Without an AI service there
 * is nothing to ask yet.
 */
export function suggestionsFor(s: SetupState): string[] {
  if (!s.ai) return [];
  const out: string[] = [];
  const on = (id: string) => s.enabled.has(id);
  if (s.campus && on('campus-card')) out.push('校园卡还剩多少钱？');
  if (s.campus && on('course-sync')) out.push('把这学期的课表同步过来');
  else if (s.campus && on('netfee')) out.push('网费还剩多少？');
  if (s.campus && on('courses') && out.length < 3) out.push('最近有哪些作业要交？');
  const general = ['这周是第几教学周？', '明天早上 8 点提醒我交作业', '帮我搭一个看板'];
  for (const g of general) {
    if (out.length >= 3) break;
    out.push(g);
  }
  return out.slice(0, 3);
}
