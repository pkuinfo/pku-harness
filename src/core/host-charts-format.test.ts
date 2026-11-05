import { describe, expect, test } from 'bun:test';

import { donutArcs, segmentAt } from '@/components/charts/donut-geometry';

import { axisLabels, formatChartValue } from './host-charts-format';

describe('formatChartValue', () => {
  test('groups thousands, keeps decimals and affixes', () => {
    expect(formatChartValue(1234.5, { valuePrefix: '¥', decimals: 2 })).toBe('¥1,234.50');
    expect(formatChartValue(-18, { valuePrefix: '¥' })).toBe('-¥18');
    expect(formatChartValue(999)).toBe('999');
    expect(formatChartValue(1000000, { valueSuffix: ' 次' })).toBe('1,000,000 次');
    expect(formatChartValue(Number.NaN)).toBe('0');
  });
});

describe('axisLabels', () => {
  test('short series label every point', () => {
    expect(axisLabels(['a', 'b', 'c'])).toEqual([
      { index: 0, label: 'a' },
      { index: 1, label: 'b' },
      { index: 2, label: 'c' },
    ]);
  });
  test('long series: five spread labels incl. both ends', () => {
    const labels = Array.from({ length: 30 }, (_, i) => String(i + 1));
    expect(axisLabels(labels).map((l) => l.index)).toEqual([0, 7, 15, 22, 29]);
    expect(axisLabels(labels, 'none')).toEqual([]);
    expect(axisLabels(labels, 'all')).toHaveLength(30);
  });
});

describe('donut geometry', () => {
  const C = 100;
  test('arcs are fractions from 12 o’clock; zero values skipped', () => {
    const arcs = donutArcs([3, 0, 1], C);
    expect(arcs[0]).toEqual({ start: 0, frac: 0.75, dash: 73 });
    expect(arcs[1]).toBeNull();
    expect(arcs[2]).toEqual({ start: 0.75, frac: 0.25, dash: 23 });
    expect(donutArcs([0, 0], C)).toEqual([null, null]);
    // A single segment closes the ring (no gap).
    expect(donutArcs([5], C)[0]).toEqual({ start: 0, frac: 1, dash: 100 });
  });
  test('hit test by angle on the ring only', () => {
    const arcs = donutArcs([1, 1, 1, 1], C);
    const size = 100;
    const th = 12;
    // Ring radius (100 - 12) / 2 = 44 around (50, 50).
    expect(segmentAt(arcs, 60, 50 - 44, size, th)).toBe(0); // just right of 12 o'clock
    expect(segmentAt(arcs, 50 + 44, 60, size, th)).toBe(1); // below 3 o'clock
    expect(segmentAt(arcs, 40, 50 + 44, size, th)).toBe(2); // left of 6 o'clock
    expect(segmentAt(arcs, 50 - 44, 40, size, th)).toBe(3);
    expect(segmentAt(arcs, 50, 50, size, th)).toBeNull(); // the hole
  });
});
