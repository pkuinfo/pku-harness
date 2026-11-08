import { describe, expect, test } from 'bun:test';

import { thinkingBody, thinkingPreview, thinkingSeconds, thinkingTail } from './thinking';

describe('thinkingPreview', () => {
  test('first non-empty line, emphasis and list markers dropped', () => {
    expect(thinkingPreview('\n\n**用户想查** 研讨室\n第二行')).toBe('用户想查 研讨室');
    expect(thinkingPreview('## Plan\n- step')).toBe('Plan');
    expect(thinkingPreview('1. call `wallet.cardBalance` first')).toBe('call wallet.cardBalance first');
  });

  test('empty thinking gives an empty preview', () => {
    expect(thinkingPreview('  \n ')).toBe('');
  });
});

describe('thinkingBody', () => {
  test('drops emphasis and squeezes blank runs', () => {
    expect(thinkingBody('**a**\n\n\n\nb ')).toBe('a\n\nb');
  });
});

describe('thinkingTail', () => {
  test('short text is kept whole', () => {
    expect(thinkingTail('abc', 10)).toBe('abc');
  });

  test('long text keeps the tail, starting at a line break when one is near', () => {
    const text = `${'x'.repeat(50)}\nline one\nline two`;
    expect(thinkingTail(text, 24)).toBe('line one\nline two');
  });

  test('without a nearby line break it cuts mid-line', () => {
    expect(thinkingTail('abcdefghij', 4)).toBe('ghij');
  });
});

describe('thinkingSeconds', () => {
  test('rounds, never below 1', () => {
    expect(thinkingSeconds(0)).toBe(1);
    expect(thinkingSeconds(1400)).toBe(1);
    expect(thinkingSeconds(12_600)).toBe(13);
  });
});
