/**
 * Responsiveness monitor: how late the JS thread runs. A timer asks to fire every SAMPLE_MS; how
 * much later it actually fires is the time a tap or switch would have waited for JS. Keeps the
 * last minute of samples; each stall is logged as `[perf]` (adb logcat -s ReactNativeJS) so a test
 * run shows exactly when the app stopped answering. Pure parts are unit-tested.
 */
export const SAMPLE_MS = 100;
/** A delay a person notices on a tap (well past one 60 Hz frame budget plus input latency). */
export const STALL_MS = 120;
const WINDOW = Math.round(60_000 / SAMPLE_MS);

export type PerfSnapshot = { samples: number; p50: number; p95: number; max: number; stalls: number };

/** Nearest-rank percentile of `values` (0 when empty). */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

export function summarize(lags: readonly number[]): PerfSnapshot {
  return {
    samples: lags.length,
    p50: percentile(lags, 50),
    p95: percentile(lags, 95),
    max: lags.reduce((m, v) => Math.max(m, v), 0),
    stalls: lags.filter((v) => v >= STALL_MS).length,
  };
}

let lags: number[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

/** Start sampling (idempotent). */
export function startPerfMonitor(now: () => number = Date.now) {
  if (timer) return;
  let last = now();
  timer = setInterval(() => {
    const t = now();
    const lag = Math.max(0, t - last - SAMPLE_MS);
    last = t;
    lags.push(lag);
    if (lags.length > WINDOW) lags = lags.slice(-WINDOW);
    if (lag >= STALL_MS) console.warn(`[perf] JS stall ${lag} ms`);
  }, SAMPLE_MS);
}

/** The last minute: median, p95 and worst lag in ms, and how many samples were stalls. */
export const perfSnapshot = (): PerfSnapshot => summarize(lags);
