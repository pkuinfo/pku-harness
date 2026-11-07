import { parts } from '@pku-harness/sdk';

/**
 * First line of every turn's <context> block (docs/AGENT-HARNESS.md §5.1). Uses the app's clock
 * zone (SDK `clock.ts`: the device's zone by default, or the fixed zone chosen in Settings),
 * matching the scheduler (`packages/sdk/.../recurrence.ts`), the ledger plugin and the Schedule
 * tab — so every layer agrees. On a Beijing-time phone (virtually every PKU user) this is Beijing
 * time; off-zone it follows the setting instead of silently disagreeing with the reminders and
 * dates the user sees.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** `当前时间：2026-10-20 周二 21:40` in the app clock zone. */
export function localTimeLine(now = new Date()): string {
  const p = parts(now.getTime());
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  // parts.weekday is ISO (1=Mon…7=Sun); `% 7` maps it to the 0=Sun…6=Sat table.
  return `当前时间：${date} 周${WEEKDAYS[p.weekday % 7]} ${pad(p.hour)}:${pad(p.minute)}`;
}
