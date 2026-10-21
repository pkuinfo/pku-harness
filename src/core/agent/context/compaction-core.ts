/**
 * Pure context-management logic (docs/AGENT-HARNESS.md §5.3–5.5): budget math, cut selection,
 * tool-result pruning and capping, the summary request and the commit. No I/O here: everything
 * the runtime provides (token estimate, the model call, ids) is injected, so `bun test` covers it.
 * The stateful wrappers live in `compaction.ts`.
 *
 * Modelled on DeepSeek Harness `packages/compaction/compaction-basic` (threshold, tool-pairing
 * aware range selection, cache-friendly summary request, framed checkpoint, rejection when the
 * summary is not smaller) and `compaction-tool-result-pruner`.
 */
import type { ModelMessage, ToolResultPart } from 'ai';

import type { ChatMessage, ChatPart } from '@/core/agent/session/chat-store';

export const LIMITS = {
  /** Auto-compaction threshold as a share of the model window. */
  thresholdShare: 0.8,
  /** Recent history kept verbatim, as a share of the budget. */
  tailShare: 0.25,
  /** §5.4 step 1: tool results outside the tail longer than this are pruned to head + tail. */
  pruneOver: 6_000,
  pruneHead: 3_000,
  pruneTail: 1_000,
  /** §5.5: a tool result entering the history is capped above this. */
  capOver: 12_000,
  capHead: 8_000,
  capTail: 2_000,
  /** /compact keeps this many turns; overflow recovery keeps only the last one. */
  manualKeepTurns: 2,
  overflowKeepTurns: 1,
} as const;

export const PRUNE_MARK = '\n…（中间省略）…\n';
export const CAP_NOTICE = '（结果过长已截断；完整结果在界面中。需要更多请缩小查询范围再调用）';
export const CHECKPOINT_PREAMBLE = '以下是之前对话的摘要（自动生成），请直接接着对话，不要提及摘要本身。';
const OPEN = '<compacted-summary>';
const CLOSE = '</compacted-summary>';

/**
 * Sent as the last user message after the replayed conversation (not as a separate system
 * prompt), so the request is a prefix-extension of the last chat request and hits the cache.
 */
export const SUMMARY_INSTRUCTION = `现在请暂停对话，把以上全部对话压缩成一份结构化摘要，供之后无缝继续对话使用。

严格按下面的 Markdown 结构输出，保留每个小节和顺序；用简短的条目，不写大段文字；某节没有内容就写"（无）"，不要删掉小节。

## 用户的目标与偏好
## 已确认的事实与数据
## 已完成的操作（工具与结果）
## 未完成的事项
## 当前进展
## 其他重要上下文

规则：
- 原样保留数字、金额、姓名、课程名、地点、编号与 ID、日期和时间，不要四舍五入或改写。
- 如实记录用户的要求、偏好和纠正。
- 如果对话里已有 ${OPEN} 块，那是更早的摘要：把它合并进来，保留仍然成立的内容，删除过时的事实，输出一份统一的摘要，不要原样照抄。
- <context> 里每轮附带的当前时间等信息不需要记录。
- 不要提及这次摘要请求，不要调用任何工具，只输出摘要正文。`;

export type SessionData = { messages: ChatMessage[]; history: ModelMessage[] };
export type Estimate = (messages: ModelMessage[]) => number;
export type CompactionMode = 'auto' | 'manual' | 'overflow';

// ---------------------------------------------------------------- budget (§5.3)

/** Auto-compaction threshold: min(80 % of the window, the user's budget; null = 不限). */
export function computeBudget(window: number, userBudget: number | null): number {
  const share = Math.floor(window * LIMITS.thresholdShare);
  return userBudget == null ? share : Math.min(share, userBudget);
}

/** Tokens of recent history kept verbatim when compacting. */
export const tailBudgetOf = (budget: number) => Math.floor(budget * LIMITS.tailShare);

// ---------------------------------------------------------------- strings

/** Never cut a UTF-16 surrogate pair in half (emoji in campus posts). */
function safeHead(s: string, n: number) {
  const code = s.charCodeAt(n - 1);
  return s.slice(0, code >= 0xd800 && code <= 0xdbff ? n - 1 : n);
}
function safeTail(s: string, n: number) {
  let start = s.length - n;
  const code = s.charCodeAt(start);
  if (code >= 0xdc00 && code <= 0xdfff) start += 1;
  return s.slice(start);
}

/** `text` if it fits, else head + `mark` + tail. */
export function headTail(text: string, over: number, head: number, tail: number, mark = PRUNE_MARK): string {
  if (text.length <= over) return text;
  return safeHead(text, head) + mark + safeTail(text, tail);
}

const serialize = (v: unknown): string => {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};

// ---------------------------------------------------------------- tool output capping (§5.5)

/**
 * Cap a raw tool result before the model sees it. Short results come back unchanged (same
 * object). A long one becomes a plain string: the first 8,000 + last 2,000 chars of its
 * serialisation, an omission mark and the notice. A string reads better to the model than a
 * half-object (`{ truncated, preview }` would just nest the same text one level deeper), and
 * the head usually keeps the JSON keys that tell the model what it is looking at.
 */
export function capToolOutput(output: unknown): unknown {
  const text = serialize(output);
  if (text.length <= LIMITS.capOver) return output;
  return `${safeHead(text, LIMITS.capHead)}\n…（中间省略 ${text.length - LIMITS.capHead - LIMITS.capTail} 字）…\n${safeTail(text, LIMITS.capTail)}\n${CAP_NOTICE}`;
}

type Output = ToolResultPart['output'];

/** Text of a model-facing tool result, or null when it has none worth shortening (files, denials). */
function outputText(o: Output): string | null {
  switch (o.type) {
    case 'text':
    case 'error-text':
      return o.value;
    case 'json':
    case 'error-json':
      return serialize(o.value);
    case 'content':
      return o.value.every((p) => p.type === 'text') ? o.value.map((p) => (p.type === 'text' ? p.text : '')).join('\n') : null;
    default:
      return null;
  }
}

/** Same as `capToolOutput` for an AI SDK `ToolResultOutput` (use from a tool's `toModelOutput`). */
export function capToolResultOutput(o: Output): Output {
  const text = outputText(o);
  if (text == null || text.length <= LIMITS.capOver) return o;
  const value = capToolOutput(text) as string;
  return { type: o.type === 'error-text' || o.type === 'error-json' ? 'error-text' : 'text', value };
}

// ---------------------------------------------------------------- pruning (§5.4 step 1)

/** Shorten tool results in `history[0, end)` longer than 6,000 chars. Returns a new array. */
export function pruneToolResults(history: ModelMessage[], end = history.length): { history: ModelMessage[]; pruned: number } {
  let pruned = 0;
  const out = history.map((m, i) => {
    if (i >= end || m.role !== 'tool') return m;
    let changed = false;
    const content = m.content.map((part) => {
      if (part.type !== 'tool-result') return part;
      const text = outputText(part.output);
      if (text == null || text.length <= LIMITS.pruneOver) return part;
      changed = true;
      pruned += 1;
      const isError = part.output.type === 'error-text' || part.output.type === 'error-json';
      return { ...part, output: { type: isError ? 'error-text' : 'text', value: headTail(text, LIMITS.pruneOver, LIMITS.pruneHead, LIMITS.pruneTail) } } as typeof part;
    });
    return changed ? { ...m, content } : m;
  });
  return { history: pruned ? out : history, pruned };
}

// ---------------------------------------------------------------- cut selection

const callIds = (m: ModelMessage): string[] =>
  m.role === 'assistant' && Array.isArray(m.content)
    ? m.content.filter((p) => p.type === 'tool-call' && !p.providerExecuted).map((p) => (p as { toolCallId: string }).toolCallId)
    : [];
const resultIds = (m: ModelMessage): string[] =>
  m.role === 'tool' ? m.content.filter((p) => p.type === 'tool-result').map((p) => (p as { toolCallId: string }).toolCallId) : [];

/**
 * Whether the history can be cut before index `i` (history[i] is the first kept message): it
 * must not start with a tool result, and every tool call before the cut must have its result
 * before the cut too (an assistant tool call is never separated from its result).
 */
export function isBalancedCut(history: ModelMessage[], i: number): boolean {
  if (i <= 0 || i >= history.length) return false;
  const role = history[i].role;
  if (role === 'tool' || role === 'system') return false;
  const open = new Set<string>();
  for (let k = 0; k < i; k++) {
    for (const id of callIds(history[k])) open.add(id);
    for (const id of resultIds(history[k])) open.delete(id);
  }
  if (open.size === 0) return true;
  // A call whose result never arrived (aborted turn) doesn't block the cut; one answered after it does.
  for (let k = i; k < history.length; k++) for (const id of resultIds(history[k])) if (open.has(id)) return false;
  return true;
}

export const isCheckpoint = (m: ModelMessage | undefined) =>
  m?.role === 'user' && typeof m.content === 'string' && m.content.startsWith(CHECKPOINT_PREAMBLE);

/** Indices of real user turns (a previous checkpoint is not a turn). */
const userTurns = (history: ModelMessage[]) => history.flatMap((m, i) => (m.role === 'user' && !isCheckpoint(m) ? [i] : []));

/**
 * First kept index, or null when there is nothing worth compacting. The last user turn is always
 * kept whole. With `keepTurns` the cut lands on the start of that many final turns; otherwise the
 * tail grows backwards (over balanced cut points) while it fits `tailBudget`.
 */
export function selectCut(history: ModelMessage[], opts: { estimate: Estimate; tailBudget?: number; keepTurns?: number }): number | null {
  const turns = userTurns(history);
  if (!turns.length) return null;
  let cut: number;
  if (opts.keepTurns != null) {
    cut = turns[Math.max(0, turns.length - opts.keepTurns)];
  } else {
    cut = turns[turns.length - 1];
    const budget = opts.tailBudget ?? 0;
    let tail = 0;
    for (let k = history.length - 1; k >= cut; k--) tail += opts.estimate([history[k]]);
    for (let j = cut - 1; j >= 1; j--) {
      tail += opts.estimate([history[j]]);
      if (tail > budget) break;
      if (isBalancedCut(history, j)) cut = j;
    }
  }
  // An aborted turn may leave the chosen point unbalanced: move earlier until it is.
  while (cut > 0 && !isBalancedCut(history, cut)) cut -= 1;
  if (cut <= 0) return null;
  // Only an earlier checkpoint before the cut: summarising a summary gains nothing.
  if (history.slice(0, cut).every(isCheckpoint)) return null;
  return cut;
}

// ---------------------------------------------------------------- summary + commit

/** Cache-friendly summary request: the replaced history verbatim, then the instruction. */
export const buildSummaryMessages = (prefix: ModelMessage[]): ModelMessage[] => [...prefix, { role: 'user', content: SUMMARY_INSTRUCTION }];

/** Model output → clean summary text (drops echoed tags / code fences). */
export function cleanSummary(text: string): string {
  let s = text.trim();
  s = s.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  if (s.startsWith(OPEN)) s = s.slice(OPEN.length);
  if (s.endsWith(CLOSE)) s = s.slice(0, -CLOSE.length);
  return s.trim();
}

/** The model-visible checkpoint that replaces the compacted history. */
export const checkpointMessage = (summary: string): ModelMessage => ({
  role: 'user',
  content: `${CHECKPOINT_PREAMBLE}\n${OPEN}\n${summary}\n${CLOSE}`,
});

/**
 * Where the compaction marker goes in the UI list: before the UI user message that starts the
 * same turn as history[cut] (counted from the end; the UI keeps every old message). A cut in
 * the middle of a turn lands after that turn's assistant message.
 */
export function uiCutIndex(messages: ChatMessage[], history: ModelMessage[], cut: number): number {
  const keptTurns = history.slice(cut).filter((m) => m.role === 'user' && !isCheckpoint(m)).length;
  const users = messages.flatMap((m, i) => (m.role === 'user' ? [i] : []));
  if (!users.length) return messages.length;
  return users[Math.max(0, users.length - keptTurns)];
}

/** UI user/assistant messages between the previous compaction marker and `at`. */
function countCompacted(messages: ChatMessage[], at: number): number {
  let n = 0;
  for (let i = at - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'event' && m.parts.some((p) => p.type === 'compaction')) break;
    if (m.role !== 'event') n += 1;
  }
  return n;
}

export type CompactionPart = Extract<ChatPart, { type: 'compaction' }>;
export type CompactionOutcome = {
  data: SessionData;
  /** compactedMessages = 0 means only tool results were pruned (no summary, no UI marker). */
  result: { compactedMessages: number; tokensBefore: number; tokensAfter: number };
  part?: CompactionPart;
};

/** Why a summary was refused; compaction.ts turns it into a message in the app language. */
export type RejectReason = 'empty' | 'notShorter' | 'truncated';

export class CompactionRejected extends Error {
  constructor(
    readonly reason: RejectReason,
    message: string = reason,
  ) {
    super(message);
  }
}

export type CompactionDeps = {
  estimate: Estimate;
  /** System prompt + tool definitions, counted in before/after totals. */
  overhead: number;
  /** Auto threshold (§5.3). */
  budget: number;
  /** Ask the session's model for the summary of `messages` (already ends with the instruction). */
  summarize: (messages: ModelMessage[]) => Promise<string>;
  newId: () => string;
  now?: () => number;
  /** A more accurate current size (provider-reported), used only for the auto threshold check. */
  reportedTotal?: number;
};

/**
 * prune → summarise → commit (§5.4). Returns null when nothing changed. Throws
 * `CompactionRejected` when the summary is empty or not smaller, or the model call's error.
 *
 * - auto: only above `budget`; tail = 25 % of budget; stops after pruning when that suffices.
 * - manual (/compact): always summarises; keeps the last 2 turns.
 * - overflow: keeps only the last turn, and prunes tool results everywhere (the last turn too),
 *   since the request already failed for size.
 */
export async function runCompaction(data: SessionData, mode: CompactionMode, deps: CompactionDeps): Promise<CompactionOutcome | null> {
  const { estimate, overhead, budget } = deps;
  const tokensBefore = overhead + estimate(data.history);
  if (mode === 'auto' && Math.max(tokensBefore, deps.reportedTotal ?? 0) <= budget) return null;

  const cut = selectCut(
    data.history,
    mode === 'auto'
      ? { estimate, tailBudget: tailBudgetOf(budget) }
      : { estimate, keepTurns: mode === 'manual' ? LIMITS.manualKeepTurns : LIMITS.overflowKeepTurns },
  );
  const { history: pruned, pruned: prunedCount } = pruneToolResults(data.history, cut == null || mode === 'overflow' ? data.history.length : cut);

  const pruneOnly = (): CompactionOutcome | null =>
    prunedCount ? { data: { ...data, history: pruned }, result: { compactedMessages: 0, tokensBefore, tokensAfter: overhead + estimate(pruned) } } : null;

  if (cut == null) return pruneOnly();
  if (mode === 'auto' && prunedCount && overhead + estimate(pruned) <= budget) return pruneOnly();

  const replaced = pruned.slice(0, cut);
  const summary = cleanSummary(await deps.summarize(buildSummaryMessages(replaced)));
  if (!summary) throw new CompactionRejected('empty', '模型没有返回摘要');
  const checkpoint = checkpointMessage(summary);
  if (estimate([checkpoint]) >= estimate(replaced)) throw new CompactionRejected('notShorter', '摘要没有比原对话更短，已放弃压缩');

  const history = [checkpoint, ...pruned.slice(cut)];
  const tokensAfter = overhead + estimate(history);
  const at = uiCutIndex(data.messages, data.history, cut);
  const part: CompactionPart = { type: 'compaction', summary, compactedMessages: countCompacted(data.messages, at), tokensBefore, tokensAfter, auto: mode !== 'manual' };
  const marker: ChatMessage = { id: deps.newId(), role: 'event', parts: [part], createdAt: deps.now?.() ?? Date.now() };
  const messages = [...data.messages.slice(0, at), marker, ...data.messages.slice(at)];
  return { data: { messages, history }, result: { compactedMessages: part.compactedMessages, tokensBefore, tokensAfter }, part };
}

// ---------------------------------------------------------------- overflow detection (§5.4 step 4)

const OVERFLOW =
  /context[ _-]?(length|window)|maximum context|context_length_exceeded|prompt is too long|input (is )?too long|too many (input |prompt )?tokens|reduce the length of (the )?(messages|prompt|input)|exceeds? (the )?(model'?s? )?(maximum|max|context|token limit)|上下文.{0,8}(超|过长|超出|超过)|超出.{0,8}(上下文|最大长度)/i;
const RATE_LIMIT = /rate[ _-]?limit|per minute|tokens per min|\bTPM\b|\bRPM\b|quota/i;

/** A provider error that says the prompt is too long for the model (OpenAI-compatible, DeepSeek, …). */
export function isContextOverflowError(e: unknown): boolean {
  const texts: string[] = [];
  let status: number | undefined;
  const seen = new Set<unknown>();
  const walk = (x: unknown, depth: number) => {
    if (!x || depth > 5 || seen.has(x)) return;
    seen.add(x);
    if (typeof x === 'string') {
      texts.push(x);
      return;
    }
    if (typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    if (typeof o.statusCode === 'number') status ??= o.statusCode;
    if (typeof o.status === 'number') status ??= o.status;
    for (const k of ['message', 'responseBody', 'code', 'type']) if (typeof o[k] === 'string') texts.push(o[k] as string);
    walk(o.data, depth + 1);
    walk(o.error, depth + 1);
    walk(o.cause, depth + 1);
    walk(o.lastError, depth + 1);
    if (Array.isArray(o.errors)) for (const err of o.errors) walk(err, depth + 1);
  };
  walk(e, 0);
  if (status === 429) return false;
  const text = texts.join('\n');
  if (RATE_LIMIT.test(text)) return false;
  return status === 413 || OVERFLOW.test(text);
}
