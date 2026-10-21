/// <reference types="bun" />
import { describe, expect, mock, test } from 'bun:test';

// Day labels read the app language from src/i18n, which imports native modules; stub them.
mock.module('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
mock.module('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));

const { formatCompact, formatDay, formatInt, formatMoney, formatMonies, formatPercent, formatShortDay } = await import('./format');

describe('formatMoney', () => {
  test('symbols, decimals and tiny amounts', () => {
    expect(formatMoney(0, 'CNY')).toBe('¥0');
    expect(formatMoney(0.0004, 'CNY')).toBe('<¥0.001');
    expect(formatMoney(0.0342, 'CNY')).toBe('¥0.034');
    expect(formatMoney(12.3, 'USD')).toBe('$12.30');
    expect(formatMoney(1234.5, 'CNY')).toBe('¥1,235');
    expect(formatMoney(3.2, 'EUR')).toBe('EUR 3.20');
    expect(formatMoney(-2, 'CNY')).toBe('-¥2.00');
  });
  test('lists stay per currency', () => {
    expect(formatMonies([{ currency: 'CNY', amount: 1.2 }, { currency: 'USD', amount: 0.4 }])).toBe('¥1.20 + $0.400');
    expect(formatMonies([])).toBe('');
  });
});

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
    // A partial value never rounds up to a perfect score.
    expect(formatPercent(0.9953)).toBe('99%');
  });
});

describe('formatDay', () => {
  test('month, day and weekday', () => {
    expect(formatDay(new Date(2026, 9, 19), 'zh-Hans')).toBe('10月19日 周一');
    expect(formatDay(new Date(2026, 9, 19), 'en')).toBe('Mon, Oct 19');
  });
  test('short day', () => {
    expect(formatShortDay(new Date(2026, 9, 19), 'zh-Hans')).toBe('10月19日');
    expect(formatShortDay(new Date(2026, 9, 19), 'en')).toBe('Oct 19');
  });
});
