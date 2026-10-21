/// <reference types="bun" />
import type { ModelMessage } from 'ai';
import { describe, expect, test } from 'bun:test';

import { estimateMessages, estimateTokens, PART_OVERHEAD, splitHistory } from './estimate';

describe('estimateTokens', () => {
  test('latin text ≈ 4 chars per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('hello world!')).toBe(3);
  });
  test('CJK characters weigh 0.6', () => {
    expect(estimateTokens('北京大学')).toBe(Math.ceil(4 * 0.6));
    expect(estimateTokens('校园卡余额')).toBe(3);
    // Mixed: 2 CJK (1.2) + 4 latin (1) → 3.
    expect(estimateTokens('余额 123')).toBe(Math.ceil(2 * 0.6 + 4 / 4));
    // Full-width punctuation counts as CJK.
    expect(estimateTokens('，。')).toBe(2);
  });
});

describe('estimateMessages', () => {
  test('adds overhead per message and part', () => {
    const msgs: ModelMessage[] = [
      { role: 'user', content: 'abcd' },
      { role: 'assistant', content: [{ type: 'text', text: 'abcdefgh' }] },
    ];
    expect(estimateMessages(msgs)).toBe(PART_OVERHEAD + 1 + PART_OVERHEAD + PART_OVERHEAD + 2);
  });
});

describe('splitHistory', () => {
  test('context blocks, tool results and conversation', () => {
    const msgs: ModelMessage[] = [
      { role: 'user', content: '<context>\n当前时间：2026-10-20 周二 21:40\n</context>\n\n余额多少' },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'card__balance', input: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'card__balance', output: { type: 'json', value: { balance: 123.45 } } }] },
      { role: 'assistant', content: '还剩 123.45 元' },
    ];
    const s = splitHistory(msgs);
    expect(s.context).toBeGreaterThan(0);
    expect(s.toolResults).toBeGreaterThan(0);
    expect(s.conversation).toBeGreaterThan(0);
    // Splitting a string can round up once more than the whole.
    const sum = s.context + s.toolResults + s.conversation;
    expect(sum - estimateMessages(msgs)).toBeGreaterThanOrEqual(0);
    expect(sum - estimateMessages(msgs)).toBeLessThanOrEqual(1);
  });
  test('no context block → all conversation', () => {
    const s = splitHistory([{ role: 'user', content: '你好' }]);
    expect(s).toEqual({ conversation: PART_OVERHEAD + 2, toolResults: 0, context: 0 });
  });
});
