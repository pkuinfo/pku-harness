import { describe, expect, test } from 'bun:test';

import type { ChatMessage } from '@/core/agent/session/chat-store';

import { formatTokens, lastReplyText, sessionMarkdown } from './format';

const msg = (role: ChatMessage['role'], parts: ChatMessage['parts']): ChatMessage => ({ id: Math.random().toString(), role, parts, createdAt: 0 });

describe('formatTokens', () => {
  test('thin formatting', () => {
    expect(formatTokens(980)).toBe('980');
    expect(formatTokens(18_200)).toBe('18.2k');
    expect(formatTokens(2_100)).toBe('2.1k');
    expect(formatTokens(12_000)).toBe('12k');
    expect(formatTokens(1_250_000)).toBe('1.3M');
  });
});

describe('session text', () => {
  const messages = [
    msg('user', [{ type: 'text', text: '余额多少' }]),
    msg('assistant', [
      { type: 'tool', callId: '1', toolId: 'campus-card.getBalance', status: 'done' },
      { type: 'tool', callId: '2', toolId: 'netfee.get', status: 'error' },
      { type: 'text', text: '还剩 32 元。' },
    ]),
    msg('event', [{ type: 'notice', tone: 'info', text: '已复制' }]),
    msg('assistant', []),
  ];
  test('last reply text skips empty replies', () => {
    expect(lastReplyText(messages)).toBe('还剩 32 元。');
    expect(lastReplyText([])).toBeNull();
  });
  test('markdown skips events, lists tools', () => {
    const md = sessionMarkdown('校园卡', messages, (id) => (id === 'campus-card.getBalance' ? '查询校园卡余额' : id));
    expect(md).toBe('# 校园卡\n\n## 我\n\n余额多少\n\n## 助手\n\n- 调用 查询校园卡余额\n- 调用 netfee.get（失败）\n\n还剩 32 元。\n');
    expect(md).not.toContain('已复制');
  });
});
