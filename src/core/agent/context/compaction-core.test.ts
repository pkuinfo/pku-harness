/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { ModelMessage } from 'ai';

import type { ChatMessage } from '@/core/agent/session/chat-store';
import {
  CAP_NOTICE,
  CHECKPOINT_PREAMBLE,
  CompactionRejected,
  LIMITS,
  PRUNE_MARK,
  SUMMARY_INSTRUCTION,
  buildSummaryMessages,
  capToolOutput,
  capToolResultOutput,
  checkpointMessage,
  cleanSummary,
  computeBudget,
  isBalancedCut,
  isCheckpoint,
  isContextOverflowError,
  pruneToolResults,
  runCompaction,
  selectCut,
  tailBudgetOf,
  uiCutIndex,
  type CompactionDeps,
  type SessionData,
} from './compaction-core';

// ---------------------------------------------------------------- fixtures

const estimate = (ms: ModelMessage[]) => Math.ceil(JSON.stringify(ms).length / 4);
const user = (text: string): ModelMessage => ({ role: 'user', content: text });
const assistant = (text: string): ModelMessage => ({ role: 'assistant', content: [{ type: 'text', text }] });
const call = (id: string, text = ''): ModelMessage => ({
  role: 'assistant',
  content: [...(text ? [{ type: 'text' as const, text }] : []), { type: 'tool-call', toolCallId: id, toolName: 'wallet__cardBalance', input: {} }],
});
const result = (id: string, value: unknown = { balance: 42 }): ModelMessage => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId: id, toolName: 'wallet__cardBalance', output: typeof value === 'string' ? { type: 'text', value } : { type: 'json', value: value as never } }],
});

let ids = 0;
const uiUser = (text: string): ChatMessage => ({ id: `u${ids++}`, role: 'user', parts: [{ type: 'text', text }], createdAt: 0 });
const uiAssistant = (text: string): ChatMessage => ({ id: `a${ids++}`, role: 'assistant', parts: [{ type: 'text', text }], createdAt: 0 });

/** n turns: user, assistant tool call, tool result, assistant answer. */
function conversation(n: number, filler = 200): SessionData {
  const history: ModelMessage[] = [];
  const messages: ChatMessage[] = [];
  for (let i = 0; i < n; i++) {
    history.push(user(`问题 ${i} ${'x'.repeat(filler)}`), call(`c${i}`), result(`c${i}`), assistant(`回答 ${i} ${'y'.repeat(filler)}`));
    messages.push(uiUser(`问题 ${i}`), uiAssistant(`回答 ${i}`));
  }
  return { history, messages };
}

const deps = (over: Partial<CompactionDeps> = {}): CompactionDeps => ({
  estimate,
  overhead: 100,
  budget: 1_000,
  summarize: async () => '## 用户的目标与偏好\n- 查余额\n## 当前进展\n- 余额 42 元',
  newId: () => 'marker',
  now: () => 1,
  ...over,
});

// ---------------------------------------------------------------- budget

describe('budget math', () => {
  test('min of 80 % of the window and the user budget', () => {
    expect(computeBudget(128_000, 64_000)).toBe(64_000);
    expect(computeBudget(64_000, 64_000)).toBe(51_200);
    expect(computeBudget(1_000_000, 256_000)).toBe(256_000);
    expect(computeBudget(1_000_000, null)).toBe(800_000);
    expect(computeBudget(32_768, null)).toBe(26_214);
  });
  test('tail is 25 % of the budget', () => {
    expect(tailBudgetOf(64_000)).toBe(16_000);
    expect(tailBudgetOf(51_201)).toBe(12_800);
  });
});

// ---------------------------------------------------------------- capping

describe('capToolOutput', () => {
  test('short results are returned as is', () => {
    const o = { balance: 42, items: [1, 2, 3] };
    expect(capToolOutput(o)).toBe(o);
    expect(capToolOutput('x'.repeat(LIMITS.capOver))).toBe('x'.repeat(LIMITS.capOver));
  });

  test('long strings keep the first 8,000 and last 2,000 chars plus the notice', () => {
    const text = 'H'.repeat(8_000) + 'M'.repeat(5_000) + 'T'.repeat(2_000);
    const capped = capToolOutput(text) as string;
    expect(capped.startsWith('H'.repeat(8_000) + '\n…（中间省略 5000 字）…\n')).toBe(true);
    expect(capped).not.toContain('M');
    expect(capped.endsWith('T'.repeat(2_000) + '\n' + CAP_NOTICE)).toBe(true);
  });

  test('long objects are capped on their JSON serialisation', () => {
    const o = { posts: Array.from({ length: 2_000 }, (_, i) => ({ id: i, text: '树洞' })) };
    const capped = capToolOutput(o) as string;
    expect(typeof capped).toBe('string');
    expect(capped.startsWith('{"posts":[{"id":0')).toBe(true);
    expect(capped.endsWith(CAP_NOTICE)).toBe(true);
    expect(capped.length).toBeLessThan(10_200);
  });

  test('never splits a surrogate pair', () => {
    const text = 'a'.repeat(7_999) + '😀' + 'b'.repeat(10_000);
    const capped = capToolOutput(text) as string;
    expect(capped.startsWith('a'.repeat(7_999) + '\n')).toBe(true);
    expect(capped).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  test('ToolResultOutput variant for toModelOutput', () => {
    const small = { type: 'json' as const, value: { a: 1 } };
    expect(capToolResultOutput(small)).toBe(small);
    const big = capToolResultOutput({ type: 'json', value: { s: 'z'.repeat(20_000) } });
    expect(big.type).toBe('text');
    expect((big as { value: string }).value.endsWith(CAP_NOTICE)).toBe(true);
    expect(capToolResultOutput({ type: 'error-text', value: 'e'.repeat(20_000) }).type).toBe('error-text');
  });
});

// ---------------------------------------------------------------- pruning

describe('pruneToolResults', () => {
  test('shortens long results before `end` only, to head 3,000 + mark + tail 1,000', () => {
    const long = 'A'.repeat(3_000) + 'B'.repeat(4_000) + 'C'.repeat(1_000);
    const history = [user('q'), call('1'), result('1', long), assistant('ok'), user('q2'), call('2'), result('2', long)];
    const { history: out, pruned } = pruneToolResults(history, 4);
    expect(pruned).toBe(1);
    const part = (out[2] as Extract<ModelMessage, { role: 'tool' }>).content[0] as { output: { type: string; value: string } };
    expect(part.output.type).toBe('text');
    expect(part.output.value).toBe('A'.repeat(3_000) + PRUNE_MARK + 'C'.repeat(1_000));
    expect(out[6]).toBe(history[6]);
    expect(out[0]).toBe(history[0]);
  });

  test('json results are measured by their serialisation; short ones untouched', () => {
    const history = [user('q'), call('1'), result('1', { list: 'x'.repeat(7_000) }), call('2'), result('2', { ok: true })];
    const { history: out, pruned } = pruneToolResults(history);
    expect(pruned).toBe(1);
    expect(out[4]).toBe(history[4]);
  });

  test('returns the same array when nothing changes', () => {
    const history = [user('q'), call('1'), result('1')];
    expect(pruneToolResults(history).history).toBe(history);
  });
});

// ---------------------------------------------------------------- cut selection

describe('isBalancedCut', () => {
  const h = [user('q'), call('1'), result('1'), call('2', '再查一次'), result('2'), assistant('好'), user('q2')];
  test('never between an assistant tool call and its result', () => {
    expect(isBalancedCut(h, 2)).toBe(false); // starts with a tool result
    expect(isBalancedCut(h, 4)).toBe(false);
    expect(isBalancedCut(h, 3)).toBe(true); // between steps: call 1 answered
    expect(isBalancedCut(h, 5)).toBe(true);
    expect(isBalancedCut(h, 6)).toBe(true);
  });
  test('bounds', () => {
    expect(isBalancedCut(h, 0)).toBe(false);
    expect(isBalancedCut(h, h.length)).toBe(false);
  });
  test('parallel calls answered in one tool message', () => {
    const p: ModelMessage[] = [
      user('q'),
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'a', toolName: 't', input: {} }, { type: 'tool-call', toolCallId: 'b', toolName: 't', input: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'a', toolName: 't', output: { type: 'text', value: '1' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'b', toolName: 't', output: { type: 'text', value: '2' } }] },
      assistant('done'),
    ];
    expect(isBalancedCut(p, 3)).toBe(false);
    expect(isBalancedCut(p, 4)).toBe(true);
  });
  test('a call whose result never arrived does not block', () => {
    const p = [user('q'), call('lost'), user('q2'), assistant('a')];
    expect(isBalancedCut(p, 2)).toBe(true);
  });
});

describe('selectCut', () => {
  test('null when there is a single turn or none', () => {
    expect(selectCut([], { estimate, tailBudget: 100 })).toBeNull();
    expect(selectCut([user('q'), call('1'), result('1'), assistant('a')], { estimate, tailBudget: 0 })).toBeNull();
  });

  test('always keeps the last user turn whole, even over the tail budget', () => {
    const { history } = conversation(3);
    expect(selectCut(history, { estimate, tailBudget: 0 })).toBe(8);
  });

  test('grows the tail backwards while it fits, on balanced points only', () => {
    const { history } = conversation(6);
    const perTurn = estimate(history.slice(0, 4));
    const cut = selectCut(history, { estimate, tailBudget: perTurn * 2 + 20 })!;
    expect(cut).toBeLessThan(20);
    expect(cut).toBeGreaterThanOrEqual(12);
    expect(isBalancedCut(history, cut)).toBe(true);
    expect(estimate(history.slice(cut))).toBeLessThanOrEqual(perTurn * 2 + 20);
    expect(history[cut].role).not.toBe('tool');
  });

  test('a huge tool step in the middle of a turn can be cut after its result', () => {
    const history = [user('old'), assistant('a'), user('q'), call('1'), result('1', 'r'.repeat(4_000)), call('2'), result('2'), assistant('done'), user('now')];
    const tailBudget = history.slice(5).reduce((n, m) => n + estimate([m]), 0);
    const cut = selectCut(history, { estimate, tailBudget })!;
    expect(cut).toBe(5);
  });

  test('keepTurns cuts at the start of the last N turns (/compact keeps 2, overflow 1)', () => {
    const { history } = conversation(5);
    expect(selectCut(history, { estimate, keepTurns: 2 })).toBe(12);
    expect(selectCut(history, { estimate, keepTurns: 1 })).toBe(16);
    expect(selectCut(conversation(2).history, { estimate, keepTurns: 2 })).toBeNull();
  });

  test('a previous checkpoint is not a turn and is not compacted alone', () => {
    const { history } = conversation(2);
    const h = [checkpointMessage('旧摘要'), ...history];
    expect(selectCut(h, { estimate, keepTurns: 2 })).toBeNull();
    expect(selectCut(h, { estimate, keepTurns: 1 })).toBe(5);
  });

  test('moves earlier when an aborted turn left the point unbalanced', () => {
    // call c9's result arrives after the last user message (corrupted order): cut must move before c9.
    const h = [user('a'), assistant('a'), user('b'), call('c9'), user('c'), result('c9'), assistant('x')];
    const cut = selectCut(h, { estimate, tailBudget: 0 })!;
    expect(cut).toBe(3);
    expect(isBalancedCut(h, 4)).toBe(false);
  });
});

// ---------------------------------------------------------------- summary request

describe('summary request + checkpoint', () => {
  test('replays the replaced history verbatim, instruction last', () => {
    const prefix = conversation(2).history;
    const msgs = buildSummaryMessages(prefix);
    expect(msgs.slice(0, -1)).toEqual(prefix);
    expect(msgs.at(-1)).toEqual({ role: 'user', content: SUMMARY_INSTRUCTION });
    for (const h of ['## 用户的目标与偏好', '## 已确认的事实与数据', '## 已完成的操作（工具与结果）', '## 未完成的事项', '## 当前进展', '## 其他重要上下文', '<compacted-summary>']) {
      expect(SUMMARY_INSTRUCTION).toContain(h);
    }
  });

  test('checkpoint framing', () => {
    const m = checkpointMessage('S');
    expect(m.content).toBe(`${CHECKPOINT_PREAMBLE}\n<compacted-summary>\nS\n</compacted-summary>`);
    expect(CHECKPOINT_PREAMBLE).toBe('以下是之前对话的摘要（自动生成），请直接接着对话，不要提及摘要本身。');
    expect(isCheckpoint(m)).toBe(true);
    expect(isCheckpoint(user('hi'))).toBe(false);
  });

  test('cleanSummary strips echoed tags and fences', () => {
    expect(cleanSummary('  <compacted-summary>\n## a\n</compacted-summary> ')).toBe('## a');
    expect(cleanSummary('```markdown\n## a\n- b\n```')).toBe('## a\n- b');
    expect(cleanSummary('   ')).toBe('');
  });

  test('uiCutIndex puts the marker before the first kept turn', () => {
    const data = conversation(4);
    expect(uiCutIndex(data.messages, data.history, 12)).toBe(6);
    expect(uiCutIndex(data.messages, data.history, 8)).toBe(4);
    // Mid-turn cut (tail starts at an assistant step of turn 2) → after turn 2's UI messages.
    expect(uiCutIndex(data.messages, data.history, 11)).toBe(6);
  });
});

// ---------------------------------------------------------------- full pipeline

describe('runCompaction', () => {
  test('auto: nothing below the budget', async () => {
    const data = conversation(2, 10);
    expect(await runCompaction(data, 'auto', deps({ budget: 100_000 }))).toBeNull();
  });

  test('auto: a reported size above the budget triggers it', async () => {
    const data = conversation(6);
    const out = await runCompaction(data, 'auto', deps({ budget: 100_000, reportedTotal: 120_000 }));
    expect(out?.result.compactedMessages).toBeGreaterThan(0);
  });

  test('manual: the summary request reuses the stored history verbatim (cache prefix), not the pruned copy', async () => {
    const data = conversation(6);
    // A big tool result early on: pruned in the committed history, but sent as stored for the summary.
    data.history[2] = result('c0', 'z'.repeat(20_000));
    let request: ModelMessage[] = [];
    const out = (await runCompaction(data, 'manual', deps({ summarize: async (m) => ((request = m), '## 当前进展\n- 余额 42 元') })))!;
    const cut = data.history.length - (out.data.history.length - 1);
    expect(request.slice(0, -1)).toEqual(data.history.slice(0, cut));
    expect(request.at(-1)?.content).toBe(SUMMARY_INSTRUCTION);
  });

  test('auto: summarise and commit [checkpoint, ...tail] with a UI marker', async () => {
    const data = conversation(8);
    let request: ModelMessage[] = [];
    const out = (await runCompaction(data, 'auto', deps({ summarize: async (m) => ((request = m), '## 当前进展\n- 余额 42 元') })))!;
    const { history, messages } = out.data;
    expect(isCheckpoint(history[0])).toBe(true);
    expect(history[0].content).toContain('余额 42 元');
    // Tail is a verbatim suffix of the old history, starting on a balanced point.
    const tail = history.slice(1);
    const cut = data.history.length - tail.length;
    expect(data.history.slice(cut)).toEqual(tail);
    expect(isBalancedCut(data.history, cut)).toBe(true);
    // Last user turn kept whole.
    expect(cut).toBeLessThanOrEqual(data.history.findLastIndex((m) => m.role === 'user'));
    // Request = replaced prefix + instruction.
    expect(request.slice(0, -1)).toEqual(data.history.slice(0, cut));
    expect(request.at(-1)?.content).toBe(SUMMARY_INSTRUCTION);
    // UI keeps everything and gets one marker.
    expect(messages.length).toBe(data.messages.length + 1);
    const marker = messages.find((m) => m.role === 'event')!;
    expect(marker.id).toBe('marker');
    const part = marker.parts[0];
    expect(part.type).toBe('compaction');
    if (part.type !== 'compaction') return;
    expect(part.auto).toBe(true);
    expect(part.summary).toBe('## 当前进展\n- 余额 42 元');
    expect(part.compactedMessages).toBe(messages.indexOf(marker));
    expect(part.tokensAfter).toBeLessThan(part.tokensBefore);
    expect(out.result).toEqual({ compactedMessages: part.compactedMessages, tokensBefore: part.tokensBefore, tokensAfter: part.tokensAfter });
    expect(part.tokensBefore).toBe(100 + estimate(data.history));
  });

  test('auto: pruning alone is enough → no model call, no marker', async () => {
    const history = [user('q1'), call('1'), result('1', 'r'.repeat(20_000)), assistant('ok'), user('q2'), assistant('a2')];
    const data: SessionData = { history, messages: [uiUser('q1'), uiAssistant('ok'), uiUser('q2'), uiAssistant('a2')] };
    let called = false;
    const out = (await runCompaction(data, 'auto', deps({ budget: 2_000, summarize: async () => ((called = true), 'x') })))!;
    expect(called).toBe(false);
    expect(out.result.compactedMessages).toBe(0);
    expect(out.data.messages).toBe(data.messages);
    expect(out.result.tokensAfter).toBeLessThanOrEqual(2_000);
    expect(JSON.stringify(out.data.history)).toContain('（中间省略）');
  });

  test('manual keeps the last 2 turns and runs below the budget', async () => {
    const data = conversation(5, 50);
    const out = (await runCompaction(data, 'manual', deps({ budget: 1_000_000 })))!;
    expect(out.data.history.length).toBe(1 + 8);
    expect(out.data.history[1]).toEqual(data.history[12]);
    const part = out.part!;
    expect(part.auto).toBe(false);
    expect(part.compactedMessages).toBe(6);
    expect(out.data.messages[6].role).toBe('event');
  });

  test('manual with too little history: null', async () => {
    expect(await runCompaction(conversation(2), 'manual', deps())).toBeNull();
  });

  test('a second compaction merges into the first and counts only new messages', async () => {
    const first = (await runCompaction(conversation(5, 50), 'manual', deps()))!;
    const next: SessionData = {
      history: [...first.data.history, user('新问题'), assistant('新回答'), user('再问'), assistant('再答')],
      messages: [...first.data.messages, uiUser('新问题'), uiAssistant('新回答'), uiUser('再问'), uiAssistant('再答')],
    };
    let request: ModelMessage[] = [];
    const second = (await runCompaction(next, 'manual', deps({ newId: () => 'marker2', summarize: async (m) => ((request = m), '合并后的摘要') })))!;
    expect(isCheckpoint(request[0])).toBe(true); // the earlier summary is replayed for merging
    expect(second.data.history.filter(isCheckpoint).length).toBe(1);
    expect(second.data.history.slice(1)).toEqual(next.history.slice(-4));
    expect(second.data.messages.filter((m) => m.role === 'event').length).toBe(2);
    expect(second.part!.compactedMessages).toBe(4); // 2 turns since the first marker
  });

  test('overflow keeps only the last turn and prunes inside it too', async () => {
    const data = conversation(3, 50);
    data.history.push(user('最后'), call('z'), result('z', 'q'.repeat(30_000)));
    data.messages.push(uiUser('最后'), uiAssistant(''));
    const out = (await runCompaction(data, 'overflow', deps({ budget: 1_000_000 })))!;
    expect(out.data.history.length).toBe(4);
    expect(out.data.history[1]).toEqual(user('最后'));
    expect(JSON.stringify(out.data.history[3]).length).toBeLessThan(5_000);
    expect(out.part!.auto).toBe(true);
  });

  test('rejects an empty or not-smaller summary', async () => {
    const data = conversation(5, 10);
    await expect(runCompaction(data, 'manual', deps({ summarize: async () => '  ' }))).rejects.toBeInstanceOf(CompactionRejected);
    await expect(runCompaction(data, 'manual', deps({ summarize: async () => 'z'.repeat(50_000) }))).rejects.toBeInstanceOf(CompactionRejected);
  });

  test('model errors propagate', async () => {
    await expect(runCompaction(conversation(5), 'manual', deps({ summarize: async () => Promise.reject(new Error('boom')) }))).rejects.toThrow('boom');
  });
});

// ---------------------------------------------------------------- overflow errors

describe('isContextOverflowError', () => {
  const apiError = (statusCode: number, message: string, responseBody?: string) => Object.assign(new Error(message), { statusCode, responseBody });

  test('detects OpenAI-compatible and DeepSeek context errors', () => {
    expect(
      isContextOverflowError(
        apiError(400, "This model's maximum context length is 65536 tokens. However, you requested 70000 tokens (69000 in the messages, 1000 in the completion). Please reduce the length of the messages or completion."),
      ),
    ).toBe(true);
    expect(isContextOverflowError(apiError(400, 'Bad Request', '{"error":{"code":"context_length_exceeded","message":"..."}}'))).toBe(true);
    expect(isContextOverflowError({ message: 'prompt is too long: 210000 tokens > 200000 maximum' })).toBe(true);
    expect(isContextOverflowError(apiError(413, 'Payload Too Large'))).toBe(true);
    expect(isContextOverflowError(new Error('请求的上下文长度超出模型限制'))).toBe(true);
    expect(isContextOverflowError({ message: 'input exceeds the context window of this model' })).toBe(true);
  });

  test('looks through retry wrappers and causes', () => {
    const inner = apiError(400, "This model's maximum context length is 131072 tokens.");
    expect(isContextOverflowError({ name: 'AI_RetryError', message: 'Failed after 3 attempts', errors: [inner], lastError: inner })).toBe(true);
    expect(isContextOverflowError(new Error('wrapped', { cause: inner }))).toBe(true);
  });

  test('ignores unrelated and rate-limit errors', () => {
    expect(isContextOverflowError(new Error('network request failed'))).toBe(false);
    expect(isContextOverflowError(apiError(401, 'Invalid API key'))).toBe(false);
    expect(isContextOverflowError(apiError(429, 'Rate limit reached: too many tokens per minute'))).toBe(false);
    expect(isContextOverflowError(null)).toBe(false);
    expect(isContextOverflowError('oops')).toBe(false);
  });
});
