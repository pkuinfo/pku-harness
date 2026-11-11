/**
 * CONTRACT (owned by the usage agent; docs/AGENT-HARNESS.md §5.2, §6). Token estimates, model
 * windows and the context breakdown behind the composer's ring and the context sheet.
 * The pure estimators live in `src/core/usage/estimate.ts` (unit-tested without React Native).
 */
import { lastReport } from '@/core/usage';
import { estimateTokens, estimateTools, PART_OVERHEAD, splitHistory } from '@/core/usage/estimate';

import { chatStore, sessionStore } from '@/core/agent/session/chat-store';
import { contextBudget, contextWindowOf, getContextBudgetSetting } from './budget';
import { aiConfig } from '@/core/agent/provider';
import { sessions } from '@/core/agent/session/sessions';
import { buildSystemPrompt } from './system-prompt';
import { buildToolSet } from '@/core/agent/tools';

export { estimateMessages, estimateTokens, estimateTools } from '@/core/usage/estimate';

export { contextWindowOf, DEFAULT_CONTEXT_WINDOW } from './budget';

/** What fills a session's context right now, for the meter and the context sheet. */
export type ContextBreakdown = {
  window: number;
  /**
   * What the meter measures against: the model's window with "Model maximum" (the default), else
   * the user's budget. Compaction itself triggers at `compactAt`.
   */
  budget: number;
  /** Auto-compaction threshold (compaction.ts). */
  compactAt: number;
  systemTokens: number;
  toolsTokens: number;
  /** Plugin request context (<context> blocks: memory, time). */
  contextTokens: number;
  conversationTokens: number;
  toolResultTokens: number;
  total: number;
  /** Last provider-reported prompt size, when known (more accurate than the estimate). */
  reportedInputTokens?: number;
  compactions: number;
  /** No conversation yet (the composer hides its ring; the sheet still shows the fixed cost). */
  empty: boolean;
};


export function contextBreakdown(sessionId?: string): ContextBreakdown {
  const sid = sessionId ?? sessions.activeId();
  const meta = sessions.get(sid);
  const active = aiConfig.get();
  const providerId = meta?.providerId ?? active.providerId;
  const model = meta?.model ?? active.model;
  const window = contextWindowOf(providerId, model);
  // Compaction threshold (budget.ts); the meter shows the whole window when no budget is set.
  const compactAt = contextBudget(sid);
  const budget = getContextBudgetSetting() == null ? window : compactAt;

  // Any loaded session's model-visible history; the active one is always available.
  const state = sessionStore.get(sid) ?? (sid === sessions.activeId() ? chatStore.get() : undefined);
  const history = state?.history ?? [];
  const messages = state?.messages ?? [];
  let systemTokens = 0;
  let toolsTokens = 0;
  try {
    systemTokens = PART_OVERHEAD + estimateTokens(buildSystemPrompt());
  } catch {
    // Registry not ready: leave at 0.
  }
  try {
    toolsTokens = estimateTools(buildToolSet());
  } catch {
    // idem
  }
  const split = splitHistory(history);

  let compactions = 0;
  let lastCompactionAt = 0;
  let lastUserAt = 0;
  for (const m of messages) {
    if (m.role === 'user') lastUserAt = Math.max(lastUserAt, m.createdAt);
    for (const p of m.parts) {
      if (p.type === 'compaction') {
        compactions++;
        lastCompactionAt = Math.max(lastCompactionAt, m.createdAt);
      }
    }
  }

  const estimated = systemTokens + toolsTokens + split.context + split.conversation + split.toolResults;
  const report = lastReport(sid);
  // §5.2: the last reported prompt + the reply appended after it is exact, as long as nothing
  // changed the history since (a compaction, or a new user message whose turn hasn't reported).
  const fresh = !!report && history.length > 0 && report.at >= lastCompactionAt && report.at >= lastUserAt;
  const total = fresh ? report!.inputTokens + report!.outputTokens : estimated;
  // Scale the estimated parts so the bar adds up to the total.
  const k = estimated > 0 ? total / estimated : 0;
  const scaled = (n: number) => Math.round(n * k);
  const parts = {
    systemTokens: scaled(systemTokens),
    toolsTokens: scaled(toolsTokens),
    contextTokens: scaled(split.context),
    conversationTokens: scaled(split.conversation),
    toolResultTokens: scaled(split.toolResults),
  };
  return {
    window,
    budget,
    compactAt,
    ...parts,
    // Always the real cost of the next request: system prompt + tools are sent even on turn one.
    total,
    empty: history.length === 0,
    reportedInputTokens: report?.inputTokens,
    compactions,
  };
}
