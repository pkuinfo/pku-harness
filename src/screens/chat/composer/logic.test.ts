import { describe, expect, test } from 'bun:test';

import {
  counterState,
  countChars,
  countLines,
  detectPaste,
  firstLine,
  formatContextWindow,
  formatCount,
  insertedText,
  MAX_CHARS,
  pasteLabel,
  shortModelName,
} from './logic';

describe('countChars', () => {
  test('counts code points, not UTF-16 units', () => {
    expect(countChars('')).toBe(0);
    expect(countChars('abc')).toBe(3);
    expect(countChars('北大')).toBe(2);
    expect(countChars('😀a')).toBe(2);
  });
});

describe('countLines', () => {
  test('empty is zero lines, one newline is two', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb')).toBe(2);
  });
});

describe('formatCount', () => {
  test('thousands separators', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(3214)).toBe('3,214');
    expect(formatCount(100000)).toBe('100,000');
  });
});

describe('insertedText', () => {
  test('finds the inserted middle', () => {
    expect(insertedText('ac', 'abc')).toEqual({ start: 1, inserted: 'b', removed: 0 });
  });
  test('replacing a selection', () => {
    expect(insertedText('a--c', 'aXYZc')).toEqual({ start: 1, inserted: 'XYZ', removed: 2 });
  });
  test('repeated characters', () => {
    expect(insertedText('aa', 'aaaa').inserted).toBe('aa');
  });
});

describe('detectPaste', () => {
  const big = 'x'.repeat(2001);
  test('ignores typing and small pastes', () => {
    expect(detectPaste('hel', 'hell')).toBeNull();
    expect(detectPaste('', 'y'.repeat(2000))).toBeNull();
    expect(detectPaste('abc', 'ab')).toBeNull();
  });
  test('more than 2,000 chars in one change', () => {
    expect(detectPaste('前后', `前${big}后`)).toEqual({ pasted: big, rest: '前后' });
  });
  test('more than 40 lines in one change', () => {
    const lines = Array.from({ length: 41 }, (_, i) => `l${i}`).join('\n');
    expect(detectPaste('', lines)).toEqual({ pasted: lines, rest: '' });
    const forty = Array.from({ length: 40 }, () => 'l').join('\n');
    expect(detectPaste('', forty)).toBeNull();
  });
  test('a paste over a selection keeps the selection removed', () => {
    expect(detectPaste('a--c', `a${big}c`)).toEqual({ pasted: big, rest: 'ac' });
  });
});

describe('labels', () => {
  test('paste chip label', () => {
    const text = `${'字'.repeat(3214 - 85)}${'\n'.repeat(85)}`;
    expect(pasteLabel(text)).toBe('粘贴的文本 · 3,214 字 · 86 行');
  });
  test('first non-empty line, truncated', () => {
    expect(firstLine('\n\n  hello \nworld')).toBe('hello');
    expect(firstLine('abcdef', 3)).toBe('abc…');
  });
});

describe('counterState', () => {
  test('shows from 1,000 and turns over above the hard limit', () => {
    expect(counterState(1000)).toEqual({ show: false, over: false });
    expect(counterState(1001)).toEqual({ show: true, over: false });
    expect(counterState(MAX_CHARS)).toEqual({ show: true, over: false });
    expect(counterState(MAX_CHARS + 1)).toEqual({ show: true, over: true });
  });
});

describe('shortModelName', () => {
  test('tier word from the catalog name', () => {
    expect(shortModelName('deepseek-flash', 'DeepSeek-V4.1-Flash')).toBe('Flash');
    expect(shortModelName('deepseek-v4-pro', 'DeepSeek-V4-Pro')).toBe('Pro');
  });
  test('falls back to the id, truncated', () => {
    expect(shortModelName('gpt-4o')).toBe('gpt-4o');
    expect(shortModelName('qwen/qwen3-235b-a22b-instruct')).toBe('qwen3-235b-…');
    expect(shortModelName('m', 'Model 4')).toBe('m');
    expect(shortModelName('')).toBe('未选择');
  });
});

describe('formatContextWindow', () => {
  test('M and K', () => {
    expect(formatContextWindow(1_000_000)).toBe('1M');
    expect(formatContextWindow(2_000_000)).toBe('2M');
    expect(formatContextWindow(1_048_576)).toBe('1M');
    expect(formatContextWindow(128_000)).toBe('128K');
    expect(formatContextWindow(32_768)).toBe('33K');
    expect(formatContextWindow(undefined)).toBeNull();
  });
});
