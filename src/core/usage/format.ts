/**
 * Thin number formatting for usage and context (docs/AGENT-HARNESS.md: `12.4k`, `1,234 字`,
 * `86%`). Hermes' Intl ignores most locales, so format by hand.
 */

/** 1234567 → "1,234,567". Rounds to an integer. */
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const s = String(Math.round(Math.abs(n)));
  return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function trim(x: number): string {
  // One decimal, dropped when it is .0 ("64k", not "64.0k").
  const s = x.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Compact count: 860 → "860", 12400 → "12.4k", 64000 → "64k", 1_200_000 → "1.2M". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a < 1000) return sign + String(Math.round(a));
  // Round first so 999,960 becomes "1M", not "1000k".
  if (Math.round(a / 100) < 10_000) return sign + trim(a / 1000) + 'k';
  if (Math.round(a / 100_000) < 10_000) return sign + trim(a / 1_000_000) + 'M';
  return sign + trim(a / 1_000_000_000) + 'B';
}

/** Ratio 0–1 → "86%". Tiny non-zero ratios show "<1%" rather than a misleading "0%". */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  if (ratio > 0 && ratio < 0.005) return '<1%';
  return `${Math.round(ratio * 100)}%`;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** "10月19日 周一". */
export function formatDay(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`;
}

/** "10月19日". */
export function formatShortDay(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
