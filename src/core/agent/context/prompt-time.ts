/**
 * First line of every turn's <context> block (docs/AGENT-HARNESS.md §5.1). Uses the device's local
 * time zone, matching the scheduler (`packages/sdk/.../recurrence.ts`), the ledger plugin and the
 * Schedule tab — so every layer agrees. On a Beijing-time phone (virtually every PKU user) this is
 * Beijing time; off-zone (a student abroad) the agent follows the phone instead of silently
 * disagreeing with the reminders and dates the user sees. A future app-level time-zone override
 * (Settings) should feed this line and those date calcs from one shared source.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** `当前时间：2026-10-20 周二 21:40` (device-local) */
export function localTimeLine(now = new Date()): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `当前时间：${date} 周${WEEKDAYS[now.getDay()]} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
