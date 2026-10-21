/**
 * Column layout for Markdown tables (components/markdown.tsx). Every row shares the same column
 * widths (estimated from the longest cell; CJK counts double), a table that fits is stretched to
 * the available width (no sideways scrolling for a five-column money table), and only a table
 * that can't fit scrolls. Numeric columns align right so figures line up. Pure, unit-tested.
 */

/** Approximate rendered width of a string in "narrow character" units (CJK and full-width = 2). */
export function textUnits(s: string): number {
  let n = 0;
  for (const ch of s) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return n;
}

/** Cell source without Markdown emphasis/code marks (`**3**` → `3`): what is actually drawn. */
export const plainCell = (s: string) => s.replace(/[*_`~]/g, '').trim();

const NUMERIC = /^[\s¥$€£+\-−~≈]*\d[\d,.\s]*(%|元|k|w|万)?\s*$/i;

/** A column whose body cells are (almost) all numbers: right-aligned. */
export function numericColumn(body: readonly string[]): boolean {
  const filled = body.map(plainCell).filter(Boolean);
  if (!filled.length) return false;
  return filled.filter((s) => NUMERIC.test(s)).length / filled.length >= 0.8;
}

export type TableLayout = { widths: number[]; scroll: boolean };

/**
 * Column widths in dp. `unit` = width of one narrow character at the table's font size;
 * `padding` = horizontal padding per cell (both sides).
 */
export function layoutColumns(
  rows: readonly (readonly string[])[],
  available: number,
  opts: { unit?: number; padding?: number; min?: number; max?: number; measured?: readonly number[] } = {},
): TableLayout {
  const { unit = 7.4, padding = 16, min = 44, max = 240, measured } = opts;
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const natural = Array.from({ length: cols }, (_, c) => {
    // Measured text width when the renderer has it (real font metrics); else an estimate.
    const text = measured?.[c] ?? Math.ceil(Math.max(0, ...rows.map((r) => textUnits(plainCell(r[c] ?? '')))) * unit);
    // +2: sub-pixel rounding; a header one pixel short wraps mid-word ("Item·s").
    return Math.min(max, Math.max(min, Math.ceil(text) + padding + 2));
  });
  const total = natural.reduce((a, b) => a + b, 0);
  if (available <= 0 || total > available) return { widths: natural, scroll: total > available && available > 0 };
  // Fits: share the spare width in proportion, so the table fills the bubble.
  const k = available / total;
  const widths = natural.map((w) => Math.floor(w * k));
  return { widths, scroll: false };
}
