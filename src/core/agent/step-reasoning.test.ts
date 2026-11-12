/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { ModelMessage } from 'ai';

import { stepReasoning } from './step-reasoning';

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
    expect(stepReasoning('deepseek', [user, call('copilot__observe'), ok('copilot__observe')])).toBe('low');
    expect(stepReasoning('deepseek', [user, call('copilot__tap', 'copilot__wait'), ok('copilot__tap')])).toBe('low');
  });

  test('planning, other plugins and failures keep the default', () => {
    expect(stepReasoning('deepseek', [user])).toBeUndefined();
    expect(stepReasoning('deepseek', [user, call('copilot__start'), ok('copilot__start')])).toBeUndefined();
    expect(stepReasoning('deepseek', [user, call('copilot__tap', 'wallet__cardBalance'), ok('copilot__tap')])).toBeUndefined();
    expect(stepReasoning('deepseek', [user, call('copilot__tap'), result('copilot__tap', { type: 'error-text', value: 'STALE' })])).toBeUndefined();
    expect(stepReasoning('deepseek', [call('copilot__tap'), ok('copilot__tap'), user])).toBeUndefined();
  });

  test('only for providers that take an effort', () => {
    expect(stepReasoning('openai-compatible', [user, call('copilot__observe'), ok('copilot__observe')])).toBeUndefined();
  });
});
