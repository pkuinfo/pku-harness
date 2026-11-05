/** Pure helpers behind the plugin chart components (src/core/host-charts.tsx). */

export type ChartDatum = { label: string; value: number };
export type ChartFormat = { valuePrefix?: string; valueSuffix?: string; decimals?: number };

/** "¥1,234.50": grouped thousands, fixed decimals (default 0), optional prefix/suffix. */
export function formatChartValue(value: number, { valuePrefix = '', valueSuffix = '', decimals = 0 }: ChartFormat = {}): string {
  const d = Math.max(0, Math.min(4, Math.round(decimals)));
  const v = Number.isFinite(value) ? value : 0;
  const [int, frac] = Math.abs(v).toFixed(d).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${v < 0 ? '-' : ''}${valuePrefix}${grouped}${frac ? `.${frac}` : ''}${valueSuffix}`;
}

/**
 * Which x-axis labels to draw. 'auto': every label up to 7 points, else five evenly spaced
 * (first and last included) so they never collide; 'all' and 'none' as named.
 */
export function axisLabels(labels: string[], mode: 'auto' | 'all' | 'none' = 'auto'): { index: number; label: string }[] {
  const n = labels.length;
  if (mode === 'none' || !n) return [];
  if (mode === 'all' || n <= 7) return labels.map((label, index) => ({ index, label }));
  const picks = [...new Set([0, 1, 2, 3, 4].map((k) => Math.round((k * (n - 1)) / 4)))];
  return picks.map((index) => ({ index, label: labels[index] }));
}
