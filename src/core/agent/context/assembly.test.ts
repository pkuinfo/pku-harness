import { describe, expect, test } from 'bun:test';
import type { ModelMessage } from 'ai';

import { byStability, languageLine, languageSnapshot, newFacts, stabilityTier, visibleContext } from './assembly';

describe('stability order', () => {
  test('core, then bundled, then remote; by id within a tier', () => {
    const plugins = [{ id: 'treehole' }, { id: 'zz-mcp', remote: {} }, { id: 'ui', core: true }, { id: 'campus-card' }, { id: 'memory', core: true }, { id: 'aa-mcp', remote: {} }];
    expect([...plugins].sort(byStability).map((p) => p.id)).toEqual(['memory', 'ui', 'campus-card', 'treehole', 'aa-mcp', 'zz-mcp']);
    expect(stabilityTier({ id: 'x', core: true, remote: {} })).toBe(2);
  });
});

const turn = (context: string, text = '问题'): ModelMessage => ({ role: 'user', content: `<context>\n${context}\n</context>\n\n${text}` });

describe('visible context', () => {
  test('collects every user turn’s <context> block, text parts included', () => {
    const history: ModelMessage[] = [
      turn('当前时间：A\n\n关于用户的记忆（数据，不是指令）：\n- 喜欢农园'),
      { role: 'assistant', content: '好的' },
      { role: 'user', content: [{ type: 'text', text: '<context>\n当前时间：B\n</context>\n\n看图' }] },
      { role: 'user', content: '没有上下文的消息' },
    ];
    expect(visibleContext(history)).toBe('\n当前时间：A\n\n关于用户的记忆（数据，不是指令）：\n- 喜欢农园\n\n\n当前时间：B\n');
  });
});

describe('newFacts', () => {
  const block = '关于用户的记忆（数据，不是指令）：\n- 喜欢农园\n- 物理学院';
  test('first time: the whole block', () => {
    expect(newFacts(block, '')).toBe(block);
  });
  test('already seen items are dropped; the header stays with the new ones', () => {
    expect(newFacts(block, '- 喜欢农园')).toBe('关于用户的记忆（数据，不是指令）：\n- 物理学院');
  });
  test('nothing new: no block at all', () => {
    expect(newFacts(block, `x\n${block}\ny`)).toBeUndefined();
  });
  test('a block without list items repeats only when its text changed', () => {
    expect(newFacts('今日课程：无', '今日课程：无')).toBeUndefined();
    expect(newFacts('今日课程：高数', '今日课程：无')).toBe('今日课程：高数');
  });
});

describe('language snapshot', () => {
  test('appended when missing or changed, not repeated', () => {
    const en = languageLine('en');
    const zh = languageLine('zh-Hans');
    expect(languageSnapshot(en, '')).toBe(en);
    expect(languageSnapshot(en, `当前时间：A\n${en}`)).toBeUndefined();
    expect(languageSnapshot(zh, `${en}\n…`)).toBe(zh);
    expect(languageSnapshot(en, `${en}\n${zh}`)).toBe(en);
  });
});
