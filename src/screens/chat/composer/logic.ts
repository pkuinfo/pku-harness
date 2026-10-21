/**
 * Pure composer rules (docs/AGENT-HARNESS.md §4.3–4.5): paste detection, character counting,
 * limits and labels. No React / native imports (unit-tested with `bun test`): labels take the
 * translator (`t` / `useT()`) as an argument.
 */
import type { MessageKey, Params } from '@/i18n';

/** A translator: `t` from '@/i18n' or the function `useT()` returns. */
export type Tr = (key: MessageKey, params?: Params) => string;

/** A single change inserting more than this many characters becomes a text attachment. */
export const PASTE_CHARS = 2_000;
/** …or more than this many lines. */
export const PASTE_LINES = 40;
/** The counter appears above this many characters. */
export const COUNTER_FROM = 1_000;
/** Hard limit per message; above it sending is disabled. */
export const MAX_CHARS = 100_000;
/** Input grows to this many lines, then scrolls (and offers the full-screen editor). */
export const MAX_LINES = 6;

/** Characters as a person counts them: code points, so an emoji is 1 (not 2 UTF-16 units). */
export function countChars(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // A high surrogate followed by a low one is one code point.
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
    }
    n++;
  }
  return n;
}

export function countLines(text: string): number {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  // A file's final newline ends its last line; it doesn't start another.
  return text.charCodeAt(text.length - 1) === 10 && n > 1 ? n - 1 : n;
}

/** `1,234` (thin thousands formatting used across the harness). */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * What one onChangeText inserted: the text between the longest common prefix and suffix of the
 * previous and next value. Deletions and replacements by shorter text return ''.
 */
export function insertedText(prev: string, next: string): { start: number; inserted: string; removed: number } {
  const max = Math.min(prev.length, next.length);
  let start = 0;
  while (start < max && prev.charCodeAt(start) === next.charCodeAt(start)) start++;
  let end = 0;
  while (end < max - start && prev.charCodeAt(prev.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end++;
  return { start, inserted: next.slice(start, next.length - end), removed: prev.length - start - end };
}

/**
 * Long paste (§4.3): if this change inserted > 2,000 chars or > 40 lines, return the pasted text
 * and the draft without it; otherwise null (keep the change as typed).
 */
export function detectPaste(prev: string, next: string): { pasted: string; rest: string } | null {
  if (next.length - prev.length < 1) return null;
  const { start, inserted, removed } = insertedText(prev, next);
  if (countChars(inserted) <= PASTE_CHARS && countLines(inserted) <= PASTE_LINES) return null;
  // Whatever the paste replaced (a selection) stays replaced; only the paste moves out.
  const rest = prev.slice(0, start) + prev.slice(start + removed);
  return { pasted: inserted, rest };
}

/** "3,214 字 · 86 行" / "3,214 chars · 86 lines". */
export function textStats(text: string, tr: Tr): string {
  const chars = countChars(text);
  const lines = countLines(text);
  return `${tr('chat.count.chars', { count: chars, n: formatCount(chars) })} · ${tr('chat.count.lines', { count: lines, n: formatCount(lines) })}`;
}

/** Chip label: "粘贴的文本 · 3,214 字 · 86 行" / "Pasted text · 3,214 chars · 86 lines". */
export function pasteLabel(text: string, tr: Tr): string {
  return tr('chat.attach.pastedLabel', { stats: textStats(text, tr) });
}

/** First non-empty line, for chip previews. */
export function firstLine(text: string, max = 40): string {
  const line = text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** Counter state for a draft of `chars` characters. */
export function counterState(chars: number): { show: boolean; over: boolean } {
  return { show: chars > COUNTER_FROM, over: chars > MAX_CHARS };
}

/**
 * Pill label (§4.5): the catalog name's last word when it reads like a tier (`DeepSeek-V4.1-Flash`
 * → `Flash`), else the model id, truncated. '' when there is no model (callers say 未选择 / None).
 */
export function shortModelName(id: string, name?: string, max = 12): string {
  if (name) {
    const last = name.split(/[-\s/]/).filter(Boolean).at(-1) ?? '';
    if (/^[A-Za-z][A-Za-z]{1,9}$/.test(last)) return last[0].toUpperCase() + last.slice(1);
  }
  const base = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  if (!base) return '';
  return base.length > max ? `${base.slice(0, max - 1)}…` : base;
}

/** Context window label: 1,000,000 → "1M", 128,000 → "128K", 32,768 → "32K". */
export function formatContextWindow(tokens?: number): string | null {
  if (!tokens || tokens <= 0) return null;
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  return `${Math.round(tokens / 1000)}K`;
}
