import { describe, expect, test } from 'bun:test';

import { formatStat, statDecimals } from './stat-format';

describe('statDecimals', () => {
  test('money keeps cents, counts drop them', () => {
    expect(statDecimals(480, '¥')).toBe(2);
    expect(statDecimals(49)).toBe(0);
    expect(statDecimals(49, '', 'rooms')).toBe(0);
    expect(statDecimals(3.5, '', '%')).toBe(2);
  });
});

describe('formatStat', () => {
  test('word units get a space; symbols and CJK units stay attached', () => {
    expect(formatStat(49, { suffix: 'rooms', decimals: 0 })).toBe('49 rooms');
    expect(formatStat(98, { suffix: '%', decimals: 0 })).toBe('98%');
    expect(formatStat(300, { suffix: '座', decimals: 0 })).toBe('300座');
    expect(formatStat(474.35, { prefix: '¥', decimals: 2 })).toBe('¥474.35');
  });
});
