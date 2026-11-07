/**
 * Date/time strings in the app language (src/i18n). Hermes' Intl ignores locales for
 * toLocaleString (it prints "10/18/2026, 21:04:37"), so format by hand. Outputs match the
 * plugin SDK's `format.ts` so host and plugin UI read the same.
 *
 * Wall-clock fields come from the SDK clock (`@pku-harness/sdk`), so these honour the app's
 * time-zone setting (device zone by default, or a fixed zone) exactly like every other layer.
 */
import { parts, startOfDay as clockStartOfDay } from '@pku-harness/sdk';

import { getLocale, type Locale } from '@/i18n';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** Wall-clock fields of `d` in the app zone, as the 0-based month + JS weekday the tables expect. */
const fields = (d: Date) => {
  const p = parts(d.getTime());
  // parts.weekday is ISO (1=Mon…7=Sun); `% 7` gives the JS day (0=Sun…6=Sat).
  return { y: p.year, mo: p.month - 1, day: p.day, h: p.hour, mi: p.minute, s: p.second, wd: p.weekday % 7 };
};

/** "21:04" or, with seconds, "21:04:37". */
export function formatClock(d: Date, seconds = false) {
  const { h, mi, s } = fields(d);
  return `${pad(h)}:${pad(mi)}${seconds ? `:${pad(s)}` : ''}`;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_EN_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_EN_NARROW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** "10月18日" / "Oct 18"; the year is added when it isn't the current one. */
export function formatDate(d: Date, now = new Date(), locale: Locale = getLocale()) {
  const a = fields(d);
  const sameYear = a.y === fields(now).y;
  if (locale === 'en') return `${MONTHS_EN[a.mo]} ${a.day}${sameYear ? '' : `, ${a.y}`}`;
  return `${sameYear ? '' : `${a.y}年`}${a.mo + 1}月${a.day}日`;
}

/** "10月18日 21:04" / "Oct 18, 21:04". */
export function formatDateTime(d: Date, now = new Date(), locale: Locale = getLocale()) {
  return locale === 'en' ? `${formatDate(d, now, locale)}, ${formatClock(d)}` : `${formatDate(d, now, locale)} ${formatClock(d)}`;
}

/** "周一" / "Mon". */
export function formatWeekday(d: Date, locale: Locale = getLocale()) {
  return weekdayShort(fields(d).wd, locale);
}

/** By day number (0 = Sunday … 6 = Saturday): "周一" / "Mon". */
export function weekdayShort(day: number, locale: Locale = getLocale()) {
  return locale === 'en' ? WEEKDAYS_EN[day] : `周${WEEKDAYS[day]}`;
}

/** Spoken weekday for accessibility labels: "周一" / "Monday". */
export function weekdayLong(day: number, locale: Locale = getLocale()) {
  return locale === 'en' ? WEEKDAYS_EN_LONG[day] : `周${WEEKDAYS[day]}`;
}

/** One character for tight grids and chips: "一" / "M". */
export function weekdayNarrow(day: number, locale: Locale = getLocale()) {
  return locale === 'en' ? WEEKDAYS_EN_NARROW[day] : WEEKDAYS[day];
}

/** Month by index (0 = January): "10月" / "Oct". */
export function formatMonth(month: number, locale: Locale = getLocale()) {
  return locale === 'en' ? MONTHS_EN[month] : `${month + 1}月`;
}

/** "10月19日 周一" / "Mon, Oct 19". */
export function formatDateWeekday(d: Date, now = new Date(), locale: Locale = getLocale()) {
  const a = fields(d);
  return locale === 'en' ? `${WEEKDAYS_EN[a.wd]}, ${formatDate(d, now, locale)}` : `${formatDate(d, now, locale)} 周${WEEKDAYS[a.wd]}`;
}

/**
 * A past timestamp, relative: "刚刚" / "Just now", "3 分钟前" / "3 min ago", today "21:04",
 * "昨天 21:04" / "Yesterday 21:04", else "10月18日 21:04" / "Oct 18, 21:04".
 */
/** Within the last minute: what `formatAgo` calls 刚刚 / just now. */
export function isJustNow(ms: number, now = Date.now()) {
  return now - ms < 60_000;
}

export function formatAgo(ms: number, now = Date.now(), locale: Locale = getLocale()) {
  const en = locale === 'en';
  const diff = now - ms;
  if (diff < 60_000) return en ? 'Just now' : '刚刚';
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return en ? `${m} min ago` : `${m} 分钟前`;
  }
  const d = new Date(ms);
  const days = Math.round((clockStartOfDay(now) - clockStartOfDay(ms)) / 86_400_000);
  if (days === 0) return formatClock(d);
  if (days === 1) return en ? `Yesterday ${formatClock(d)}` : `昨天 ${formatClock(d)}`;
  return formatDateTime(d, new Date(now), locale);
}

/** "2026-10-18 21:04 周日": unambiguous, for the model (fixed format in every app language). */
export function formatFull(d: Date) {
  const a = fields(d);
  return `${a.y}-${pad(a.mo + 1)}-${pad(a.day)} ${formatClock(d)} 周${WEEKDAYS[a.wd]}`;
}
