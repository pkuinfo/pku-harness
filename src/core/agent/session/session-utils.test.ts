import { describe, expect, test } from 'bun:test';
import type { ModelMessage } from 'ai';

import type { ChatMessage } from './chat-store';
import {
  cleanTitle,
  cutBefore,
  fallbackTitle,
  formatTokens,
  fromRow,
  groupSessions,
  legacySession,
  markInterrupted,
  nextQueued,
  previewOf,
  relativeTime,
  sectionOf,
  toRow,
  turnCaption,
  userText,
} from './session-utils';

const user = (id: string, text: string): ChatMessage => ({ id, role: 'user', parts: [{ type: 'text', text }], createdAt: 1 });
const reply = (id: string, text: string): ChatMessage => ({ id, role: 'assistant', parts: [{ type: 'text', text }], createdAt: 2 });
const note = (id: string): ChatMessage => ({ id, role: 'event', parts: [{ type: 'notice', tone: 'info', text: 'x' }], createdAt: 3 });

describe('titles and previews', () => {
  test('fallback title is the first 16 chars of the first user message', () => {
    expect(fallbackTitle([user('a', '  帮我查一下  明天的课和考试安排以及图书馆开放时间 ')])).toBe('帮我查一下 明天的课和考试安排以…');
    expect(fallbackTitle([user('a', '短')])).toBe('短');
    expect(fallbackTitle([])).toBeNull();
  });
  test('preview is the last user message', () => {
    expect(previewOf([user('a', 'one'), reply('b', 'x'), user('c', 'two')])).toBe('two');
  });
  test('cleanTitle strips quotes, labels and punctuation', () => {
    expect(cleanTitle('标题：「校园卡余额查询」。')).toBe('校园卡余额查询');
    expect(cleanTitle('"Weekly plan"\nmore')).toBe('Weekly plan');
    expect(cleanTitle('  ')).toBeNull();
  });
});

describe('markInterrupted', () => {
  test('running tools become errors and the streaming reply is marked', () => {
    const msgs: ChatMessage[] = [
      user('u', 'hi'),
      { id: 'a', role: 'assistant', parts: [{ type: 'tool', callId: 'c', toolId: 'x.y', status: 'running' }], createdAt: 2 },
    ];
    const { messages, changed } = markInterrupted(msgs, 'a');
    expect(changed).toBe(true);
    expect(messages[1].parts[0]).toMatchObject({ status: 'error', error: '已中断' });
    expect(messages[1].meta?.ended).toBe('interrupted');
    expect(messages[0]).toBe(msgs[0]);
  });
  test('untouched when nothing was running', () => {
    const msgs = [user('u', 'hi'), reply('a', 'ok')];
    expect(markInterrupted(msgs).messages).toBe(msgs);
  });
});

describe('cutBefore', () => {
  const history: ModelMessage[] = [
    { role: 'user', content: '<context>…</context>\n\nq1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'q2' },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't', toolName: 'x__y', input: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't', toolName: 'x__y', output: { type: 'text', value: 'r' } }] },
    { role: 'assistant', content: 'a2' },
  ];
  const messages = [user('u1', 'q1'), reply('a1', 'a1'), note('n'), user('u2', 'q2'), reply('a2', 'a2')];

  test('cuts UI and history at the same user turn (events ignored)', () => {
    const cut = cutBefore(messages, history, 'u2')!;
    expect(cut.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'n']);
    expect(cut.history).toHaveLength(2);
    expect(cut.exact).toBe(true);
  });
  test('counts from the end, so a compaction checkpoint at the start is fine', () => {
    const compacted: ModelMessage[] = [{ role: 'user', content: '<compacted-summary>…</compacted-summary>' }, ...history.slice(2)];
    const cut = cutBefore(messages, compacted, 'u2')!;
    expect(cut.history).toHaveLength(1);
  });
  test('drops the history when the turn was compacted away', () => {
    const compacted: ModelMessage[] = [{ role: 'user', content: 'summary' }];
    const cut = cutBefore([user('u1', 'q'), reply('a', 'x'), user('u2', 'q2')], compacted, 'u1')!;
    expect(cut.exact).toBe(false);
    expect(cut.history).toEqual([]);
  });
  test('only user messages can be cut at', () => {
    expect(cutBefore(messages, history, 'a1')).toBeNull();
  });
});

describe('model text', () => {
  test('text attachments are appended inline', () => {
    const t = userText('看看这个', [
      { type: 'attachment', id: '1', kind: 'text', name: 'a "b".txt', mime: 'text/plain', size: 3, text: 'abc' },
      { type: 'attachment', id: '2', kind: 'image', name: 'p.jpg', mime: 'image/jpeg', size: 9, uri: 'file:///p.jpg' },
    ]);
    expect(t).toBe(`看看这个\n\n<attachment name="a 'b'.txt">\nabc\n</attachment>`);
  });
});

describe('list', () => {
  const now = new Date(2026, 9, 20, 15, 0).getTime();
  const h = 3_600_000;
  test('sections', () => {
    expect(sectionOf(now - h, now)).toBe('今天');
    expect(sectionOf(now - 20 * h, now)).toBe('昨天');
    expect(sectionOf(now - 4 * 24 * h, now)).toBe('7 天内');
    expect(sectionOf(now - 30 * 24 * h, now)).toBe('更早');
  });
  test('relative time', () => {
    expect(relativeTime(now - 10_000, now)).toBe('刚刚');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 分钟前');
    expect(relativeTime(new Date(2026, 9, 20, 9, 5).getTime(), now)).toBe('09:05');
    expect(relativeTime(now - 20 * h, now)).toBe('昨天');
    expect(relativeTime(new Date(2026, 0, 3).getTime(), now)).toBe('1月3日');
  });
  test('grouping, pinned first, search over title and preview', () => {
    const list = [
      { id: 'a', title: '课表', preview: '今天有什么课', pinned: false, updatedAt: now - h },
      { id: 'b', title: '余额', preview: '校园卡', pinned: true, updatedAt: now - 40 * 24 * h },
      { id: 'c', title: null, preview: '树洞搜索', pinned: false, updatedAt: now - 20 * h },
    ];
    expect(groupSessions(list, '', now).map((g) => [g.section, g.items.map((i) => i.id)])).toEqual([
      ['置顶', ['b']],
      ['今天', ['a']],
      ['昨天', ['c']],
    ]);
    expect(groupSessions(list, '树洞', now).flatMap((g) => g.items.map((i) => i.id))).toEqual(['c']);
  });
});

describe('queue and stats', () => {
  test('nextQueued respects pause', () => {
    expect(nextQueued([1, 2], false)).toBe(1);
    expect(nextQueued([1, 2], true)).toBeUndefined();
    expect(nextQueued([], false)).toBeUndefined();
  });
  test('token formatting and caption', () => {
    expect(formatTokens(860)).toBe('860');
    expect(formatTokens(12_400)).toBe('12.4k');
    expect(formatTokens(1_000)).toBe('1k');
    expect(turnCaption({ durationMs: 9200, inputTokens: 12_400, cachedInputTokens: 10_664, outputTokens: 860 }, 'Flash')).toBe('Flash · 9.2s · 输入 12.4k（缓存 86%）· 输出 860');
  });
});

describe('persistence mapping', () => {
  test('row round trip', () => {
    const meta = { id: 's', title: 't', titleSource: 'user' as const, createdAt: 1, updatedAt: 2, pinned: true, preview: 'p', providerId: 'deepseek.api', model: 'm', messageCount: 4, unread: true };
    expect(fromRow(toRow(meta))).toEqual(meta);
  });
  test('legacy chat becomes the first session', () => {
    expect(legacySession({ messages: [] }, 'x')).toBeNull();
    const moved = legacySession({ messages: [user('u', '你好'), reply('a', 'hi')], history: [{ role: 'user', content: '你好' }] }, 'x')!;
    expect(moved.meta).toMatchObject({ id: 'x', title: '你好', titleSource: 'fallback', messageCount: 2, preview: '你好' });
    expect(moved.record.history).toHaveLength(1);
  });
});
