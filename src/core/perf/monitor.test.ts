import { describe, expect, test } from 'bun:test';

import { percentile, STALL_MS, summarize } from './monitor';

describe('perf monitor', () => {
  test('nearest-rank percentiles', () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 95)).toBe(100);
  });

  test('summary counts stalls and the worst lag', () => {
    expect(summarize([0, 2, STALL_MS, 300])).toEqual({ samples: 4, p50: 2, p95: 300, max: 300, stalls: 2 });
  });
});
