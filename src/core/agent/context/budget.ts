/**
 * The context budget (docs/AGENT-HARNESS.md §5.3): the model's window from the provider catalog,
 * the user's 上下文预算 setting (Settings → AI 服务), and the auto-compaction threshold
 * min(0.8 × window, budget). Shared by ./tokens (meter) and ./compaction; depends on neither.
 */
import { useSyncExternalStore } from 'react';

import { aiConfig } from '@/core/agent/provider';
import { sessions } from '@/core/agent/session/sessions';
import { registry } from '@/core/runtime/registry';
import { kv } from '@/core/store/kv';
import { t } from '@/i18n';

import { computeBudget } from './compaction-core';

export const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Context window of a provider's model (catalog `contextWindow`, else 128k). */
export function contextWindowOf(providerId: string, model: string): number {
  const w = registry.provider(providerId)?.def.models.find((m) => m.id === model)?.contextWindow;
  return typeof w === 'number' && w > 0 ? w : DEFAULT_CONTEXT_WINDOW;
}

// 128k: the fixed prefix is ~30k and each compaction is a cache miss (AGENT-HARNESS §5.3).
export const DEFAULT_CONTEXT_BUDGET = 128_000;
/** Choices for 上下文预算; null = 不限 (only 80 % of the model window applies). */
export const CONTEXT_BUDGET_OPTIONS: { label: string; value: number | null }[] = [
  { label: '32k', value: 32_000 },
  { label: '64k', value: 64_000 },
  { label: '128k', value: 128_000 },
  { label: '256k', value: 256_000 },
  // Read in the app language each time (Settings shows it).
  {
    get label() {
      return t('chat.context.unlimited');
    },
    value: null,
  },
];

const agentStore = kv('agent');
let userBudget: number | null = DEFAULT_CONTEXT_BUDGET;
let budgetLoad: Promise<void> | null = null;
const budgetListeners = new Set<() => void>();

/** Load the saved budget once (cheap to call again). */
export function loadContextBudget(): Promise<void> {
  budgetLoad ??= agentStore
    .get<number | null>('contextBudget')
    .then((v) => {
      if (v !== undefined) userBudget = v;
      budgetListeners.forEach((l) => l());
    })
    .catch(() => {});
  return budgetLoad;
}

/** The user's budget setting in tokens; null = 不限. */
export function getContextBudgetSetting(): number | null {
  void loadContextBudget();
  return userBudget;
}

export async function setContextBudgetSetting(value: number | null): Promise<void> {
  userBudget = value;
  budgetLoad ??= Promise.resolve();
  budgetListeners.forEach((l) => l());
  await agentStore.set('contextBudget', value);
}

export function useContextBudgetSetting(): number | null {
  return useSyncExternalStore(
    (l) => {
      budgetListeners.add(l);
      void loadContextBudget();
      return () => budgetListeners.delete(l);
    },
    () => userBudget,
  );
}

/** Provider + model a session runs on (falls back to the active provider). */
export function sessionModel(sessionId?: string) {
  const meta = sessions.get(sessionId ?? sessions.activeId());
  const providerId = meta?.providerId ?? aiConfig.get().providerId;
  const model = meta?.model ?? aiConfig.settingsFor(providerId).model;
  return { providerId, model };
}

/** Auto-compaction threshold for a session (default: active): min(0.8 × window, user budget). */
export function contextBudget(sessionId?: string): number {
  const { providerId, model } = sessionModel(sessionId);
  return computeBudget(contextWindowOf(providerId, model), getContextBudgetSetting());
}
