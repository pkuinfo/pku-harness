/**
 * Thin number formatting for usage and context (docs/AGENT-HARNESS.md: `12.4k`, `1,234 字`,
 * `86%`). Hermes' Intl ignores most locales, so format by hand. Day labels follow the app
 * language (src/utils/date.ts); numbers are the same in both.
 */
import { getLocale, type Locale } from '@/i18n';
import { formatDate, formatDateWeekday } from '@/utils/date';

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
  // Never round a partial value up to a perfect score (a 99.6 % cache hit is not 100 %).
  if (ratio < 1 && Math.round(ratio * 100) === 100) return '99%';
  return `${Math.round(ratio * 100)}%`;
}

const SYMBOL: Record<string, string> = { CNY: '¥', USD: '$' };

/**
 * Money: "¥0.42", "$12.30", "¥1,234". Amounts under 1 keep three decimals (model costs are
 * often fractions of a cent); a tiny non-zero amount shows "<¥0.001". Unknown currency codes
 * are prefixed ("EUR 3.20").
 */
export function formatMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return '—';
  const sym = SYMBOL[currency] ?? `${currency} `;
  const sign = amount < 0 ? '-' : '';
  const a = Math.abs(amount);
  if (a === 0) return `${sym}0`;
  if (a < 0.001) return `<${sym}0.001`;
  if (a < 1) return `${sign}${sym}${a.toFixed(3)}`;
  if (a < 1000) return `${sign}${sym}${a.toFixed(2)}`;
  return `${sign}${sym}${formatInt(a)}`;
}

/** Several currencies, never summed: "¥1.20 + $0.40"; "" for none. */
export function formatMonies(list: readonly { currency: string; amount: number }[]): string {
  return list.map((m) => formatMoney(m.amount, m.currency)).join(' + ');
}

/** "10月19日 周一" / "Mon, Oct 19". */
export function formatDay(d: Date, locale: Locale = getLocale()): string {
  return formatDateWeekday(d, d, locale);
}

/** "10月19日" / "Oct 19". */
export function formatShortDay(d: Date, locale: Locale = getLocale()): string {
  return formatDate(d, d, locale);
}
