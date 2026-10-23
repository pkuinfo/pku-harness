/** Currency marks: amounts keep two decimals (¥480.00), everything else drops needless ones. */
const MONEY = /[¥$€£]/;

/**
 * How many decimals a stat shows when none is given: money keeps cents, whole counts show none
 * ("49", not "49.00"), and other fractions keep two.
 */
export function statDecimals(value: number, prefix = '', suffix = ''): number {
  if (MONEY.test(prefix) || MONEY.test(suffix)) return 2;
  return Number.isInteger(value) ? 0 : 2;
}

/**
 * The text of a stat: a word unit gets a space ("49 rooms"), symbols and CJK units stay attached
 * ("98%", "300座").
 */
export function formatStat(n: number, opts: { prefix?: string; suffix?: string; decimals: number }): string {
  const { prefix = '', suffix = '', decimals } = opts;
  const unit = /^[A-Za-z]/.test(suffix) ? ` ${suffix}` : suffix;
  return `${prefix}${n.toFixed(decimals)}${unit}`;
}
