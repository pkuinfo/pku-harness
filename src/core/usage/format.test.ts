/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { formatCompact, formatDay, formatInt, formatPercent } from './format';

describe('formatInt', () => {
  test('groups thousands', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(999)).toBe('999');
    expect(formatInt(1234)).toBe('1,234');
    expect(formatInt(1234567)).toBe('1,234,567');
    expect(formatInt(-4321.6)).toBe('-4,322');
  });
});

describe('formatCompact', () => {
  test('small numbers stay whole', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(860)).toBe('860');
    expect(formatCompact(999.4)).toBe('999');
  });
  test('thousands', () => {
    expect(formatCompact(1000)).toBe('1k');
    expect(formatCompact(12_400)).toBe('12.4k');
    expect(formatCompact(24_149)).toBe('24.1k');
    expect(formatCompact(64_000)).toBe('64k');
    expect(formatCompact(128_000)).toBe('128k');
  });
  test('rolls over to M without "1000k"', () => {
    expect(formatCompact(999_960)).toBe('1M');
    expect(formatCompact(1_000_000)).toBe('1M');
    expect(formatCompact(1_250_000)).toBe('1.3M');
  });
  test('non-finite', () => {
    expect(formatCompact(Number.NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  test('rounds', () => {
    expect(formatPercent(0.857)).toBe('86%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.001)).toBe('<1%');
  });
});

describe('formatDay', () => {
  test('month, day and weekday', () => {
    expect(formatDay(new Date(2026, 9, 19))).toBe('10月19日 周一');
  });
});
