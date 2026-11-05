/** Geometry of the donut chart (pure, unit-tested). */

/** Arc length (dp) left empty between neighbouring segments. */
const GAP = 2;

export type Arc = { start: number; frac: number; dash: number };

/** Segments as fractions of the ring, clockwise from 12 o'clock. Non-positive values are skipped. */
export function donutArcs(values: number[], circumference: number): (Arc | null)[] {
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  if (total <= 0) return values.map(() => null);
  const shown = values.filter((v) => v > 0).length;
  const gap = shown > 1 ? GAP : 0;
  let start = 0;
  return values.map((v) => {
    if (!(v > 0)) return null;
    const frac = v / total;
    const arc = { start, frac, dash: Math.max(0.75, frac * circumference - gap) };
    start += frac;
    return arc;
  });
}

/** Index of the segment under a point (dp from the chart's top-left), or null off the ring. */
export function segmentAt(arcs: (Arc | null)[], x: number, y: number, size: number, thickness: number): number | null {
  const dx = x - size / 2;
  const dy = y - size / 2;
  const dist = Math.hypot(dx, dy);
  const r = (size - thickness) / 2;
  if (dist < r - thickness / 2 - 8 || dist > r + thickness / 2 + 8) return null;
  // Clockwise from 12 o'clock, 0..1.
  const at = ((Math.atan2(dx, -dy) / (2 * Math.PI)) % 1 + 1) % 1;
  const i = arcs.findIndex((a) => a != null && at >= a.start && at < a.start + a.frac);
  return i < 0 ? null : i;
}
