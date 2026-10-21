/**
 * Context management (docs/AGENT-HARNESS.md §5.3–5.5): the user's context budget, automatic and
 * manual compaction, overflow recovery and tool-output capping. The logic is pure and tested in
 * `compaction-core.ts`; this module binds it to sessions, the model and usage recording.
 */
import { generateText, type ModelMessage } from 'ai';

import { recordStep } from '@/core/usage';
import { t } from '@/i18n';

import { chatStore, newId, type ChatMessage } from '@/core/agent/session/chat-store';
import {
  CompactionRejected,
  runCompaction,
  type CompactionMode,
  type CompactionOutcome,
  type RejectReason,
  type SessionData,
} from './compaction-core';
import { getModel } from '@/core/agent/provider';
import { sessions } from '@/core/agent/session/sessions';
import { contextBudget, loadContextBudget, sessionModel } from './budget';
import { buildSystemPrompt } from './system-prompt';
import { contextBreakdown, estimateMessages, estimateTokens } from './tokens';
import { buildToolSet } from '@/core/agent/tools';

export { capToolOutput, capToolResultOutput, isContextOverflowError, CompactionRejected } from './compaction-core';

export type CompactionResult = { compactedMessages: number; tokensBefore: number; tokensAfter: number };

// User budget, model window and the threshold live in ./budget (shared with ./tokens, no cycle).
export {
  CONTEXT_BUDGET_OPTIONS,
  contextBudget,
  DEFAULT_CONTEXT_BUDGET,
  getContextBudgetSetting,
  loadContextBudget,
  sessionModel,
  setContextBudgetSetting,
  useContextBudgetSetting,
} from './budget';

// ---------------------------------------------------------------- session access

/**
 * Read / write one session's UI messages and model history. Uses `sessions.data(id)` /
 * `sessions.update(id, fn)` when the sessions module provides them; otherwise the single chat
 * store (today's one conversation).
 */
type SessionAccess = {
  data?: (id: string) => SessionData | undefined;
  update?: (id: string, fn: (d: SessionData) => SessionData) => void | Promise<void>;
};
const access = sessions as unknown as SessionAccess;

function readData(sessionId: string): SessionData | undefined {
  if (access.data) return access.data(sessionId);
  const s = chatStore.get();
  return { messages: s.messages, history: s.history };
}

async function writeData(sessionId: string, before: SessionData, next: SessionData) {
  // Anything appended while the summary was being generated stays (after the new history).
  // UI: re-insert just the marker into the current list, so edits made meanwhile survive.
  const merge = (cur: SessionData): SessionData => {
    const history = cur.history === before.history ? next.history : [...next.history, ...cur.history.slice(before.history.length)];
    if (cur.messages === before.messages || next.messages === before.messages) return { history, messages: next.messages === before.messages ? cur.messages : next.messages };
    const known = new Set(before.messages.map((m) => m.id));
    const at = next.messages.findIndex((m) => !known.has(m.id));
    if (at < 0) return { history, messages: cur.messages };
    const marker = next.messages[at];
    const anchor = next.messages[at + 1]?.id;
    const pos = anchor ? cur.messages.findIndex((m) => m.id === anchor) : -1;
    const i = pos >= 0 ? pos : Math.min(at, cur.messages.length);
    return { history, messages: [...cur.messages.slice(0, i), marker, ...cur.messages.slice(i)] };
  };
  if (access.update) {
    await access.update(sessionId, merge);
    return;
  }
  chatStore.set(merge({ messages: chatStore.get().messages, history: chatStore.get().history }));
}

// ---------------------------------------------------------------- model call

async function summarize(sessionId: string, messages: ModelMessage[]): Promise<string> {
  const { providerId, model: modelName } = sessionModel(sessionId);
  const started = Date.now();
  // Same system prompt and tools as the chat request so the provider's prefix cache is reused;
  // tool calls are disabled for this request.
  const r = await generateText({
    model: await getModel(providerId),
    system: buildSystemPrompt(),
    messages,
    tools: buildToolSet(),
    toolChoice: 'none',
    maxOutputTokens: 4_096,
  });
  recordStep({
    at: started,
    sessionId,
    providerId,
    model: modelName,
    inputTokens: r.usage.inputTokens ?? 0,
    cachedInputTokens: r.usage.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: r.usage.outputTokens ?? 0,
    reasoningTokens: r.usage.outputTokenDetails?.reasoningTokens ?? 0,
    durationMs: Date.now() - started,
    tools: [],
    purpose: 'compaction',
  });
  if (r.finishReason === 'length') throw new CompactionRejected('truncated');
  return r.text;
}

/** System prompt + tool definitions, in estimated tokens. */
function overheadTokens(sessionId: string): number {
  const tools = Object.entries(buildToolSet()).map(([name, t]) => [name, t.description]);
  const own = estimateTokens(buildSystemPrompt()) + estimateTokens(JSON.stringify(tools));
  try {
    const b = contextBreakdown(sessionId);
    return Math.max(own, b.systemTokens + b.toolsTokens);
  } catch {
    return own;
  }
}

function reportedTotal(sessionId: string): number | undefined {
  try {
    return contextBreakdown(sessionId).reportedInputTokens;
  } catch {
    return undefined;
  }
}

const inflight = new Map<string, Promise<CompactionOutcome | null>>();

async function compact(sessionId: string, mode: CompactionMode): Promise<CompactionResult | null> {
  const running = inflight.get(sessionId);
  if (running) return (await running.catch(() => null))?.result ?? null;
  const before = readData(sessionId);
  if (!before?.history.length) return null;
  await loadContextBudget();
  const job = runCompaction(before, mode, {
    estimate: estimateMessages,
    overhead: overheadTokens(sessionId),
    budget: contextBudget(sessionId),
    reportedTotal: mode === 'auto' ? reportedTotal(sessionId) : undefined,
    summarize: (messages) => summarize(sessionId, messages),
    newId,
  });
  inflight.set(sessionId, job);
  try {
    const outcome = await job;
    if (!outcome) return null;
    await writeData(sessionId, before, outcome.data);
    return outcome.result;
  } finally {
    inflight.delete(sessionId);
  }
}

// ---------------------------------------------------------------- public API

/**
 * /compact: summarise everything but the last 2 turns of a session (default: active), even below
 * the budget. null = nothing to compact. Throws with a readable reason when it fails (rejected
 * summary, model error) so the command can show it.
 */
export async function compactNow(sessionId?: string): Promise<CompactionResult | null> {
  try {
    return await compact(sessionId ?? sessions.activeId(), 'manual');
  } catch (e) {
    if (e instanceof CompactionRejected) throw new CompactionRejected(e.reason, t(REJECTED[e.reason]));
    throw e;
  }
}

const REJECTED = { empty: 'chat.agent.compactEmpty', notShorter: 'chat.agent.compactNotShorter', truncated: 'chat.agent.compactTruncated' } as const satisfies Record<RejectReason, string>;

/**
 * Called by the run loop before each model request; compacts when over the session's budget.
 * Never throws: a failed compaction must not block the reply (null).
 */
export async function maybeCompact(sessionId: string): Promise<CompactionResult | null> {
  try {
    return await compact(sessionId, 'auto');
  } catch {
    return null;
  }
}

/**
 * Overflow recovery (§5.4 step 4): after a provider "context too long" error, compact keeping
 * only the last turn, then the run loop retries once. null = nothing could be done (the caller
 * should surface the original error). Never throws.
 */
export async function compactForOverflow(sessionId: string): Promise<CompactionResult | null> {
  try {
    return await compact(sessionId, 'overflow');
  } catch {
    return null;
  }
}

/** UI messages of a session that are compaction markers (for "已压缩 N 次"). */
export const compactionCount = (messages: ChatMessage[]) =>
  messages.filter((m) => m.role === 'event' && m.parts.some((p) => p.type === 'compaction')).length;
