/**
 * The chat dictionaries (src/i18n/messages/<locale>/chat.ts): same keys in both languages (the
 * Messages type enforces it at compile time; this checks the runtime objects too), the same
 * `{params}`, and the English copy rules (docs/AGENT-HARNESS.md §8).
 */
import { describe, expect, test } from 'bun:test';

import { makeTr } from '@/core/agent/session/testing-tr';
import { chat as en } from '@/i18n/messages/en/chat';
import { chat as zh } from '@/i18n/messages/zh-Hans/chat';

function flatten(node: object, prefix = 'chat'): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(node)) {
    const key = `${prefix}.${k}`;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const params = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
/** Date patterns pick the fields their language writes (2025/10/3 vs Oct 3, 2025). */
const DATE_FORMATS = new Set(['chat.time.fullDate']);
const zhKeys = flatten(zh);
const enKeys = flatten(en);

describe('chat strings', () => {
  test('every key exists in both languages and is not empty', () => {
    expect([...enKeys.keys()].sort()).toEqual([...zhKeys.keys()].sort());
    for (const [key, s] of enKeys) expect({ key, empty: !s.trim() }).toEqual({ key, empty: false });
  });

  test('placeholders match; an English `_one` may spell the count out', () => {
    for (const [key, zhText] of zhKeys) {
      const enText = enKeys.get(key)!;
      if (key.endsWith('_one')) {
        const base = params(zhKeys.get(key.slice(0, -4)) ?? zhText);
        for (const p of params(enText)) expect({ key, p, known: base.has(p) }).toEqual({ key, p, known: true });
      } else if (!DATE_FORMATS.has(key)) {
        expect({ key, params: [...params(enText)].sort() }).toEqual({ key, params: [...params(zhText)].sort() });
      }
    }
  });

  test('a `_one` key always has its plural sibling', () => {
    for (const key of zhKeys.keys()) if (key.endsWith('_one')) expect(zhKeys.has(key.slice(0, -4))).toBe(true);
  });

  test('English copy: no Chinese, no exclamation marks, curly apostrophes', () => {
    for (const [key, s] of enKeys) {
      expect({ key, cjk: /[㐀-鿿！-～「」]/.test(s) }).toEqual({ key, cjk: false });
      expect({ key, bang: s.includes('!') }).toEqual({ key, bang: false });
      expect({ key, straight: /[A-Za-z]'[A-Za-z]/.test(s) }).toEqual({ key, straight: false });
    }
  });
});

/** Keys whose params the code passes (kept in step with the call sites). */
describe('interpolation as the code calls it', () => {
  const zhT = makeTr('zh-Hans');
  const enT = makeTr('en');
  const cases: [Parameters<typeof zhT>[0], Record<string, string | number>, string, string][] = [
    ['chat.message.compacted', { count: 32, before: '18.2k', after: '2.1k' }, '已压缩 32 条消息 · 18.2k → 2.1k tokens', 'Compacted 32 messages · 18.2k → 2.1k tokens'],
    ['chat.message.compacted', { count: 1, before: '980', after: '400' }, '已压缩 1 条消息 · 980 → 400 tokens', 'Compacted 1 message · 980 → 400 tokens'],
    ['chat.tools.used', { count: 3, names: 'A, B' }, '用了 3 个工具 · A, B', 'Used 3 tools · A, B'],
    ['chat.tools.step', { title: '读树洞帖子', n: 2 }, '读树洞帖子… · 第 2 步', '读树洞帖子… · step 2'],
    ['chat.count.chars', { count: 1234, n: '1,234' }, '1,234 字', '1,234 chars'],
    ['chat.count.chars', { count: 1, n: '1' }, '1 字', '1 char'],
    ['chat.attach.sheetTitleLeft', { count: 1 }, '添加到消息 · 还能添加 1 个', 'Add to message · 1 more allowed'],
    ['chat.agent.notifyDone', { title: '课表' }, '课表 · 回复好了', '课表 · Reply ready'],
    ['chat.commands.failed', { command: '/export', error: 'x' }, '/export 失败：x', '/export failed: x'],
    ['chat.context.usedA11y', { used: '12k', budget: '64k', pct: '19%' }, '已用 12k，预算 64k，19%', '12k used of 64k budget, 19%'],
    ['chat.form.submitted', { label: 'OK', data: '{}' }, 'OK：{}', 'OK: {}'],
    ['chat.verification.resendIn', { count: 1 }, '1 秒后可重新发送', 'Resend in 1s'],
  ];
  test.each(cases)('%s', (key, p, zhText, enText) => {
    expect(zhT(key, p)).toBe(zhText);
    expect(enT(key, p)).toBe(enText);
    // Nothing left unfilled.
    expect(enT(key, p)).not.toMatch(/\{\w+\}/);
  });
});
