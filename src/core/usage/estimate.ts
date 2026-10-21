/**
 * Pure token estimation (docs/AGENT-HARNESS.md §5.2): CJK characters × 0.6 + other characters ÷ 4,
 * + 4 per message and per part. Kept free of React Native imports so `bun test` can load it;
 * `src/core/agent/tokens.ts` re-exports it. Pricing idea from deepseek-harness
 * packages/llm/token-meter/src/estimate.ts (fixed density + structural overhead per block).
 */
import type { ModelMessage } from 'ai';

/** Framing overhead per message and per content part (role tags, JSON structure). */
export const PART_OVERHEAD = 4;
/** Images and binary files: providers price them by size, not text; a flat guess. */
export const BINARY_PART_TOKENS = 800;

/** CJK ideographs, kana, hangul, CJK punctuation and full-width forms. */
function isCjk(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x3000 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

/** Rough token count of a string (CJK-aware). No allocation: one pass over char codes. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (let i = 0; i < text.length; i++) if (isCjk(text.charCodeAt(i))) cjk++;
  return Math.ceil(cjk * 0.6 + (text.length - cjk) / 4);
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : safeJson(v));

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}

/** A tool result's model-visible output (`{ type: 'text' | 'json' | …, value }` in AI SDK). */
function toolOutputText(output: unknown): string {
  if (output && typeof output === 'object' && 'value' in output) return str((output as { value: unknown }).value);
  return str(output);
}

type Part = { type: string; [k: string]: unknown };

/** Tokens of one content part (without its overhead). */
function partTokens(p: Part): number {
  switch (p.type) {
    case 'text':
    case 'reasoning':
      return estimateTokens(str(p.text));
    case 'tool-call':
      return estimateTokens(str(p.toolName)) + estimateTokens(str(p.input));
    case 'tool-result':
      return estimateTokens(str(p.toolName)) + estimateTokens(toolOutputText(p.output));
    case 'image':
      return BINARY_PART_TOKENS;
    case 'file':
      return typeof p.data === 'string' && typeof p.mediaType === 'string' && p.mediaType.startsWith('text/')
        ? estimateTokens(p.data)
        : BINARY_PART_TOKENS;
    default:
      return estimateTokens(safeJson(p));
  }
}

/** Rough token count of model messages (text, tool calls, tool results). */
export function estimateMessages(messages: readonly ModelMessage[]): number {
  let total = 0;
  for (const m of messages) {
    total += PART_OVERHEAD;
    if (typeof m.content === 'string') total += estimateTokens(m.content);
    else for (const p of m.content as Part[]) total += PART_OVERHEAD + partTokens(p);
  }
  return total;
}

/** History split into the context sheet's categories. */
export type HistorySplit = { conversation: number; toolResults: number; context: number };

const CONTEXT_OPEN = '<context>';
const CONTEXT_CLOSE = '</context>';

/** A user text that starts with the turn's `<context>…</context>` block: [contextTokens, restTokens]. */
function splitContext(text: string): [number, number] {
  if (!text.startsWith(CONTEXT_OPEN)) return [0, estimateTokens(text)];
  const end = text.indexOf(CONTEXT_CLOSE);
  if (end < 0) return [0, estimateTokens(text)];
  const cut = end + CONTEXT_CLOSE.length;
  return [estimateTokens(text.slice(0, cut)), estimateTokens(text.slice(cut))];
}

/**
 * Classify a model history: plugin `<context>` blocks (memory, time) on user turns, tool results,
 * and everything else (user text, replies, tool calls) as conversation. Overheads go with their
 * part's category.
 */
export function splitHistory(messages: readonly ModelMessage[]): HistorySplit {
  const out: HistorySplit = { conversation: 0, toolResults: 0, context: 0 };
  for (const m of messages) {
    if (m.role === 'tool') {
      out.toolResults += PART_OVERHEAD;
      for (const p of m.content as Part[]) out.toolResults += PART_OVERHEAD + partTokens(p);
      continue;
    }
    out.conversation += PART_OVERHEAD;
    if (typeof m.content === 'string') {
      if (m.role === 'user') {
        const [ctx, rest] = splitContext(m.content);
        out.context += ctx;
        out.conversation += rest;
      } else out.conversation += estimateTokens(m.content);
      continue;
    }
    for (const p of m.content as Part[]) {
      if (p.type === 'tool-result') {
        out.toolResults += PART_OVERHEAD + partTokens(p);
      } else if (m.role === 'user' && p.type === 'text') {
        const [ctx, rest] = splitContext(str(p.text));
        out.context += ctx;
        out.conversation += PART_OVERHEAD + rest;
      } else out.conversation += PART_OVERHEAD + partTokens(p);
    }
  }
  return out;
}
