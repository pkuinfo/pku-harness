/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { ModelMessage } from 'ai';

import { stepReasoning } from './step-reasoning';

const DS = ['low', 'high', 'max'] as const;
const user: ModelMessage = { role: 'user', content: '帮我在美团点一份午饭' };
const call = (...names: string[]): ModelMessage => ({
  role: 'assistant',
  content: names.map((toolName, i) => ({ type: 'tool-call' as const, toolCallId: `c${i}`, toolName, input: {} })),
});
const result = (toolName: string, output: { type: string; value: unknown }): ModelMessage => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId: 'c0', toolName, output } as never],
});
const ok = (name: string) => result(name, { type: 'json', value: { ok: true } });

describe('step reasoning', () => {
  test('the next step of a running Copilot task thinks briefly', () => {
    expect(stepReasoning(DS, 'auto', [user, call('copilot__observe'), ok('copilot__observe')])).toBe('low');
    expect(stepReasoning(DS, 'auto', [user, call('copilot__tap', 'copilot__wait'), ok('copilot__tap')])).toBe('low');
  });

  test('planning, other plugins and failures keep the default', () => {
    expect(stepReasoning(DS, 'auto', [user])).toBeUndefined();
    expect(stepReasoning(DS, 'auto', [user, call('copilot__start'), ok('copilot__start')])).toBeUndefined();
    expect(stepReasoning(DS, 'auto', [user, call('copilot__tap', 'wallet__cardBalance'), ok('copilot__tap')])).toBeUndefined();
    expect(stepReasoning(DS, 'auto', [user, call('copilot__tap'), result('copilot__tap', { type: 'error-text', value: 'STALE' })])).toBeUndefined();
    expect(stepReasoning(DS, 'auto', [call('copilot__tap'), ok('copilot__tap'), user])).toBeUndefined();
  });

  test('only for providers that take an effort', () => {
    expect(stepReasoning(undefined, 'auto', [user, call('copilot__observe'), ok('copilot__observe')])).toBeUndefined();
    expect(stepReasoning([], 'high', [user])).toBeUndefined();
  });

  test('a level the user picked applies to every step', () => {
    expect(stepReasoning(DS, 'max', [user])).toBe('max');
    expect(stepReasoning(DS, 'high', [user, call('copilot__observe'), ok('copilot__observe')])).toBe('high');
    // A level this provider doesn't take falls back to its default.
    expect(stepReasoning(DS, 'medium', [user])).toBeUndefined();
  });
});
