/**
 * Chinese date/time strings. Hermes' Intl ignores the zh-CN locale for toLocaleString (it
 * prints "10/18/2026, 21:04:37"), so format by hand.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** "21:04" or, with seconds, "21:04:37". */
export function formatClock(d: Date, seconds = false) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? `:${pad(d.getSeconds())}` : ''}`;
}

/** "10月18日 21:04"; the year is added when it isn't the current one. */
export function formatDateTime(d: Date, now = new Date()) {
  const year = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}年`;
  return `${year}${d.getMonth() + 1}月${d.getDate()}日 ${formatClock(d)}`;
}

/** "2026-10-18 21:04 周日": unambiguous, for the model. */
export function formatFull(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${formatClock(d)} 周${WEEKDAYS[d.getDay()]}`;
}
