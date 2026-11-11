/**
 * Pure text helpers for documents the agent reads: a bounded inline preview, paged slices and
 * keyword search with snippets. Used by the host and the `files` plugin service.
 */

export const INLINE_CHARS = 8000;
const MAX_SLICE = 20000;
const SNIPPET = 240;

function isHigh(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Move `i` back by one if it would split a surrogate pair. */
function safeCut(text: string, i: number): number {
  if (i > 0 && i < text.length && isHigh(text.charCodeAt(i - 1))) return i - 1;
  return i;
}

/** Best place to cut `text` at or before `max`: line break, then sentence end, then whitespace. */
function boundary(text: string, from: number, max: number): number {
  const min = from + Math.floor((max - from) * 0.6);
  const nl = text.lastIndexOf('\n', max - 1);
  if (nl >= min) return nl + 1;
  for (let i = max - 1; i >= min; i--) {
    const ch = text[i];
    if ('。！？；'.includes(ch)) return i + 1;
    if ('.!?;'.includes(ch) && /\s/.test(text[i + 1] ?? ' ')) return i + 1;
  }
  for (let i = max - 1; i >= min; i--) if (/\s/.test(text[i])) return i + 1;
  return safeCut(text, max);
}

export function inlinePreview(text: string, max = INLINE_CHARS): { head: string; truncated: boolean } {
  if (text.length <= max) return { head: text, truncated: false };
  const cut = boundary(text, 0, Math.max(1, max));
  return { head: text.slice(0, cut).trimEnd(), truncated: true };
}

export function sliceText(
  text: string,
  offset = 0,
  length = 8000,
): { offset: number; text: string; next: number | null } {
  const start = safeCut(text, Math.min(Math.max(0, Math.floor(offset) || 0), text.length));
  const len = Math.min(Math.max(1, Math.floor(length) || 1), MAX_SLICE);
  const end = start + len;
  if (end >= text.length) return { offset: start, text: text.slice(start), next: null };
  const nl = text.lastIndexOf('\n', end - 1);
  let cut = nl >= start + Math.floor(len / 2) ? nl + 1 : safeCut(text, end);
  if (cut <= start) cut = Math.min(text.length, end);
  return { offset: start, text: text.slice(start, cut), next: cut };
}

/** Lower-cased copy with the same length (so offsets map 1:1 to `text`). */
function fold(text: string): string {
  const lower = text.toLowerCase();
  if (lower.length === text.length) return lower;
  let out = '';
  for (const ch of text) {
    const l = ch.toLowerCase();
    out += l.length === ch.length ? l : ch;
  }
  return out;
}

function snippet(text: string, from: number, to: number): string {
  const span = to - from;
  let start = Math.max(0, from - Math.max(0, Math.floor((SNIPPET - span) / 2)));
  const end = safeCut(text, Math.min(text.length, Math.max(to, start + SNIPPET)));
  if (end - start < SNIPPET) start = Math.max(0, end - SNIPPET);
  start = start > 0 && isHigh(text.charCodeAt(start - 1)) ? start + 1 : start;
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

export function searchText(
  text: string,
  query: string,
  opts?: { window?: number; max?: number },
): { offset: number; snippet: string }[] {
  const max = Math.max(1, opts?.max ?? 8);
  const win = Math.max(1, opts?.window ?? 300);
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0 || text.length === 0) return [];
  const hay = fold(text);
  const hits: { from: number; to: number }[] = [];
  const covered = (p: number) => hits.some((h) => p >= h.from - SNIPPET / 2 && p <= h.to + SNIPPET / 2);

  // 1. The whole query as a phrase (whitespace-insensitive).
  const phrase = new RegExp(
    terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'),
    'g',
  );
  for (const m of hay.matchAll(phrase)) {
    if (hits.length >= max) break;
    if (!covered(m.index)) hits.push({ from: m.index, to: m.index + m[0].length });
  }

  // 2. All terms within `window` chars of an occurrence of the longest term.
  if (terms.length > 1 && hits.length < max) {
    const anchor = terms.reduce((a, b) => (b.length > a.length ? b : a));
    const others = terms.filter((t) => t !== anchor);
    for (let p = hay.indexOf(anchor); p !== -1 && hits.length < max; p = hay.indexOf(anchor, p + 1)) {
      if (covered(p)) continue;
      const lo = Math.max(0, p - win);
      const area = hay.slice(lo, p + anchor.length + win);
      let from = p;
      let to = p + anchor.length;
      let ok = true;
      for (const t of others) {
        // Nearest occurrence of the term to the anchor inside the window.
        let best = -1;
        for (let q = area.indexOf(t); q !== -1; q = area.indexOf(t, q + 1)) {
          if (best === -1 || Math.abs(lo + q - p) < Math.abs(lo + best - p)) best = q;
        }
        if (best === -1) {
          ok = false;
          break;
        }
        from = Math.min(from, lo + best);
        to = Math.max(to, lo + best + t.length);
      }
      if (ok) hits.push({ from, to });
    }
  }

  return hits
    .sort((a, b) => a.from - b.from)
    .map((h) => ({ offset: h.from, snippet: snippet(text, h.from, h.to) }));
}
