import { describe, expect, test } from 'bun:test';

import { appendDictation, clock, levelOf, pushLevel, WAVE_BARS } from './voice-logic';

describe('voice input helpers', () => {
  test('metering maps to a bar share with a floor', () => {
    expect(levelOf(undefined)).toBeCloseTo(0.08);
    expect(levelOf(-160)).toBeCloseTo(0.08);
    expect(levelOf(0)).toBeCloseTo(1);
    expect(levelOf(-20)).toBeGreaterThan(levelOf(-40));
  });

  test('the waveform keeps the newest bars, padded on the left', () => {
    const one = pushLevel([], 0.5);
    expect(one).toHaveLength(WAVE_BARS);
    expect(one.at(-1)).toBe(0.5);
    let full: number[] = [];
    for (let i = 0; i < WAVE_BARS + 5; i++) full = pushLevel(full, i);
    expect(full[0]).toBe(5);
    expect(full.at(-1)).toBe(WAVE_BARS + 4);
  });

  test('clock', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65_400)).toBe('1:05');
  });

  test('dictation appends to the draft', () => {
    expect(appendDictation('', ' 你好 ')).toBe('你好');
    expect(appendDictation('Remind me', 'at eight')).toBe('Remind me at eight');
    expect(appendDictation('提醒我', '明天交作业')).toBe('提醒我明天交作业');
    expect(appendDictation('draft ', 'more')).toBe('draft more');
    expect(appendDictation('keep', '  ')).toBe('keep');
  });
});
