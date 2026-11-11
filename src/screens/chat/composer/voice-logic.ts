/** Pure helpers for voice input (unit-tested without React Native). */

/** Longest recording; at this length it stops and transcribes by itself. */
export const MAX_VOICE_MS = 5 * 60_000;
/** Bars in the live waveform. */
export const WAVE_BARS = 36;
/** Quieter than this (dBFS) draws as silence. */
const FLOOR_DB = -55;

/** Recorder metering (dBFS, -160…0) → bar height share 0…1, with a small floor so silence still shows. */
export function levelOf(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 0.08;
  const share = (Math.max(FLOOR_DB, Math.min(0, db)) - FLOOR_DB) / -FLOOR_DB;
  return 0.08 + 0.92 * share ** 1.6;
}

/** The newest `n` levels, oldest first, padded with silence on the left. */
export function pushLevel(levels: number[], level: number, n = WAVE_BARS): number[] {
  const next = [...levels, level].slice(-n);
  return next.length < n ? [...Array<number>(n - next.length).fill(0.08), ...next] : next;
}

/** m:ss */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The draft after dictation: appended after what was typed, separated by a space unless it ends in one (or is CJK). */
export function appendDictation(draft: string, spoken: string): string {
  const said = spoken.trim();
  if (!said) return draft;
  if (!draft) return said;
  const joint = /\s$/.test(draft) || /[　-鿿＀-￯]$/.test(draft) || /^[　-鿿＀-￯]/.test(said) ? '' : ' ';
  return draft + joint + said;
}
