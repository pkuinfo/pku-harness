/**
 * First line of every turn's <context> block (docs/AGENT-HARNESS.md §5.1). Always Beijing time
 * (UTC+8, no DST), whatever the device's zone: `src/utils/date.ts` formats in local time, so this
 * shifts to UTC+8 and reads the UTC fields instead.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const BEIJING_OFFSET_MS = 8 * 3_600_000;

/** `当前时间：2026-10-20 周二 21:40（北京时间）` */
export function beijingTimeLine(now = new Date()): string {
  const d = new Date(now.getTime() + BEIJING_OFFSET_MS);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return `当前时间：${date} 周${WEEKDAYS[d.getUTCDay()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}（北京时间）`;
}
