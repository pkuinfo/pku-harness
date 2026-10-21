/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { ModelPricing } from '@pku-harness/sdk';

import { costOf, hitDiscount, isPeak, priceFactor, savedByCache } from './cost';

// DeepSeek-like: CNY per 1M tokens, ×2 on Beijing weekdays 9–12 and 14–18.
const P: ModelPricing = {
  currency: 'CNY',
  inputCacheHit: 0.02,
  inputCacheMiss: 1,
  output: 4,
  peak: { multiplier: 2, utcOffsetMinutes: 480, weekdays: [1, 2, 3, 4, 5], hours: [[9, 12], [14, 18]] },
};
/** A UTC instant given Beijing wall time. */
const bj = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h - 8, min);

describe('isPeak', () => {
  test('inside and outside the Beijing windows', () => {
    expect(isPeak(bj(2026, 10, 20, 9, 0), P)).toBe(true); // Tuesday 09:00
    expect(isPeak(bj(2026, 10, 20, 11, 59), P)).toBe(true);
    expect(isPeak(bj(2026, 10, 20, 12, 0), P)).toBe(false); // end is exclusive
    expect(isPeak(bj(2026, 10, 20, 13, 0), P)).toBe(false);
    expect(isPeak(bj(2026, 10, 20, 17, 30), P)).toBe(true);
    expect(isPeak(bj(2026, 10, 20, 8, 59), P)).toBe(false);
  });
  test('weekday is the provider zone’s, not UTC’s', () => {
    // Monday 09:30 Beijing is Monday 01:30 UTC; Saturday 10:00 Beijing is off-peak.
    expect(isPeak(bj(2026, 10, 19, 9, 30), P)).toBe(true);
    expect(isPeak(bj(2026, 10, 24, 10, 0), P)).toBe(false);
    expect(isPeak(bj(2026, 10, 25, 15, 0), P)).toBe(false);
  });
  test('no peak table → never peak', () => {
    const flat = { ...P, peak: undefined };
    expect(isPeak(bj(2026, 10, 20, 10), flat)).toBe(false);
    expect(priceFactor(bj(2026, 10, 20, 10), flat)).toBe(1);
  });
});

describe('costOf', () => {
  test('splits input into hit and miss; reasoning is inside output', () => {
    const c = costOf({ at: bj(2026, 10, 20, 22), inputTokens: 1_000_000, cachedInputTokens: 800_000, outputTokens: 100_000 }, P);
    expect(c.hit).toBeCloseTo(0.016);
    expect(c.miss).toBeCloseTo(0.2);
    expect(c.output).toBeCloseTo(0.4);
    expect(c.total).toBeCloseTo(0.616);
    expect(c.currency).toBe('CNY');
  });
  test('peak doubles every part', () => {
    const c = costOf({ at: bj(2026, 10, 20, 10), inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 }, P);
    expect(c.miss).toBeCloseTo(2);
  });
  test('cached above input is clamped', () => {
    const c = costOf({ at: bj(2026, 10, 20, 22), inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 }, P);
    expect(c.miss).toBe(0);
    expect(c.hit).toBeCloseTo((100 * 0.02) / 1e6);
  });
});

describe('savedByCache', () => {
  test('cached × (miss − hit), with the peak factor', () => {
    expect(savedByCache({ at: bj(2026, 10, 20, 22), inputTokens: 2_000_000, cachedInputTokens: 1_000_000 }, P)).toBeCloseTo(0.98);
    expect(savedByCache({ at: bj(2026, 10, 20, 10), inputTokens: 2_000_000, cachedInputTokens: 1_000_000 }, P)).toBeCloseTo(1.96);
  });
});

describe('hitDiscount', () => {
  test('miss ÷ hit, rounded', () => {
    expect(hitDiscount(P)).toBe(50);
    expect(hitDiscount({ ...P, inputCacheHit: 0 })).toBeNull();
    expect(hitDiscount({ ...P, inputCacheHit: 1 })).toBeNull();
  });
});
