import { describe, expect, test } from 'bun:test';

import { isZoneId } from '@pku-harness/sdk';

import { formatUtcOffset, offsetNow, searchZones, zoneName, ZONES } from './zones';

describe('zone list', () => {
  test('every id resolves and appears once', () => {
    for (const z of ZONES) expect(isZoneId(z.id)).toBe(true);
    expect(new Set(ZONES.map((z) => z.id)).size).toBe(ZONES.length);
  });

  test('names in both languages; unlisted ids show as-is', () => {
    expect(zoneName('Asia/Shanghai', 'zh-Hans')).toBe('北京');
    expect(zoneName('Asia/Shanghai', 'en')).toBe('Beijing');
    expect(zoneName('Asia/Ulaanbaatar', 'en')).toBe('Asia/Ulaanbaatar');
  });
});

describe('formatUtcOffset', () => {
  test.each([
    [480, 'UTC+8'],
    [-240, 'UTC−4'],
    [345, 'UTC+5:45'],
    [-150, 'UTC−2:30'],
    [0, 'UTC'],
  ])('%p → %p', (m, s) => expect(formatUtcOffset(m)).toBe(s));
});

describe('searchZones', () => {
  const winter = Date.UTC(2026, 0, 15);
  const summer = Date.UTC(2026, 6, 15);

  test('matches city, other language, id and keywords', () => {
    expect(searchZones('纽约', 'zh-Hans').map((z) => z.id)).toEqual(['America/New_York']);
    expect(searchZones('tokyo', 'zh-Hans').map((z) => z.id)).toEqual(['Asia/Tokyo']);
    expect(searchZones('shanghai', 'en').map((z) => z.id)).toContain('Asia/Shanghai');
    expect(searchZones('剑桥', 'zh-Hans').map((z) => z.id)).toEqual(['Europe/London']);
    expect(searchZones('nowhere-at-all', 'en')).toEqual([]);
  });

  test('ordered west to east by the offset in force, DST included', () => {
    for (const now of [winter, summer]) {
      const offs = searchZones('', 'en', now).map((z) => offsetNow(z.id, now));
      expect(offs).toEqual([...offs].sort((a, b) => a - b));
    }
    expect(offsetNow('America/New_York', winter)).toBe(-300);
    expect(offsetNow('America/New_York', summer)).toBe(-240);
  });
});
