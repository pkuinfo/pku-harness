/// <reference types="bun" />
import { describe, expect, mock, test } from 'bun:test';

// date.ts reads the app language from src/i18n, which imports native modules; stub them.
mock.module('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
mock.module('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));

const { formatAgo, formatClock, formatDate, formatDateTime, formatDateWeekday, formatFull, formatMonth, formatWeekday, weekdayNarrow } = await import('./date');

const d = new Date(2026, 9, 18, 21, 4, 37);

describe('zh-Hans', () => {
  test('dates', () => {
    expect(formatClock(d)).toBe('21:04');
    expect(formatClock(d, true)).toBe('21:04:37');
    expect(formatDateTime(d, new Date(2026, 0, 1), 'zh-Hans')).toBe('10月18日 21:04');
    expect(formatDateTime(d, new Date(2027, 0, 1), 'zh-Hans')).toBe('2026年10月18日 21:04');
    expect(formatWeekday(d, 'zh-Hans')).toBe('周日');
    expect(formatDateWeekday(new Date(2026, 9, 19), new Date(2026, 9, 20), 'zh-Hans')).toBe('10月19日 周一');
    expect(formatMonth(9, 'zh-Hans')).toBe('10月');
    expect(weekdayNarrow(1, 'zh-Hans')).toBe('一');
  });
  test('relative', () => {
    const now = d.getTime();
    expect(formatAgo(now - 10_000, now, 'zh-Hans')).toBe('刚刚');
    expect(formatAgo(now - 3 * 60_000, now, 'zh-Hans')).toBe('3 分钟前');
    expect(formatAgo(new Date(2026, 9, 18, 8, 0).getTime(), now, 'zh-Hans')).toBe('08:00');
    expect(formatAgo(new Date(2026, 9, 17, 8, 0).getTime(), now, 'zh-Hans')).toBe('昨天 08:00');
    expect(formatAgo(new Date(2026, 9, 12, 8, 0).getTime(), now, 'zh-Hans')).toBe('10月12日 08:00');
  });
});

describe('en', () => {
  test('dates', () => {
    expect(formatDateTime(d, new Date(2026, 0, 1), 'en')).toBe('Oct 18, 21:04');
    expect(formatDateTime(d, new Date(2027, 0, 1), 'en')).toBe('Oct 18, 2026, 21:04');
    expect(formatDate(d, new Date(2026, 0, 1), 'en')).toBe('Oct 18');
    expect(formatWeekday(d, 'en')).toBe('Sun');
    expect(formatDateWeekday(new Date(2026, 9, 19), new Date(2026, 9, 20), 'en')).toBe('Mon, Oct 19');
    expect(formatMonth(9, 'en')).toBe('Oct');
    expect(weekdayNarrow(1, 'en')).toBe('M');
  });
  test('relative', () => {
    const now = d.getTime();
    expect(formatAgo(now - 10_000, now, 'en')).toBe('Just now');
    expect(formatAgo(now - 3 * 60_000, now, 'en')).toBe('3 min ago');
    expect(formatAgo(new Date(2026, 9, 17, 8, 0).getTime(), now, 'en')).toBe('Yesterday 08:00');
    expect(formatAgo(new Date(2026, 9, 12, 8, 0).getTime(), now, 'en')).toBe('Oct 12, 08:00');
  });
});

test('the model-facing timestamp is fixed in every language', () => {
  expect(formatFull(d)).toBe('2026-10-18 21:04 周日');
});
