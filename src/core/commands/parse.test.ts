import { describe, expect, test } from 'bun:test';

import { expandPrompt, menuQuery, parseCommandLine, resolveCommand, splitCommandLine } from './parse';
import type { Command } from './types';

const cmd = (name: string, aliases: string[] = [], extra: Partial<Command> = {}): Command => ({
  name,
  aliases,
  description: name,
  group: 'session',
  run: () => ({ kind: 'done' }),
  ...extra,
});

const commands = [cmd('new', ['新对话']), cmd('rename', ['重命名'], { argHint: '新标题' }), cmd('usage', ['用量', '统计']), cmd('treehole:search', ['树洞'])];

describe('splitCommandLine', () => {
  test('token and trimmed input', () => {
    expect(splitCommandLine('/rename  期末复习 ')).toEqual({ token: 'rename', input: '期末复习' });
    expect(splitCommandLine('/new')).toEqual({ token: 'new', input: '' });
  });
  test('case-insensitive token', () => {
    expect(splitCommandLine('/NeW')?.token).toBe('new');
  });
  test('input spans later lines; token only from the first', () => {
    expect(splitCommandLine('/rename\n第二行')).toEqual({ token: 'rename', input: '第二行' });
  });
  test('not a command', () => {
    expect(splitCommandLine('hello /new')).toBeNull();
    expect(splitCommandLine('/')).toBeNull();
    expect(splitCommandLine('/ new')).toBeNull();
    expect(splitCommandLine('//comment')).toBeNull();
  });
  test('leading whitespace is ignored', () => {
    expect(splitCommandLine('  /new')?.token).toBe('new');
  });
});

describe('resolveCommand / parseCommandLine', () => {
  test('by name and alias', () => {
    expect(resolveCommand('new', commands)?.name).toBe('new');
    expect(resolveCommand('新对话', commands)?.name).toBe('new');
    expect(resolveCommand('统计', commands)?.name).toBe('usage');
    expect(resolveCommand('TREEHOLE:SEARCH', commands)?.name).toBe('treehole:search');
  });
  test('names win over aliases', () => {
    const list = [cmd('a', ['b']), cmd('b')];
    expect(resolveCommand('b', list)?.name).toBe('b');
  });
  test('must be followed by whitespace or end', () => {
    expect(parseCommandLine('/newer', commands)).toBeNull();
    expect(parseCommandLine('/new.', commands)).toBeNull();
    expect(parseCommandLine('/新对话 你好', commands)).toMatchObject({ command: { name: 'new' }, input: '你好' });
  });
  test('unknown is plain text', () => {
    expect(parseCommandLine('/xyz hi', commands)).toBeNull();
  });
});

describe('menuQuery', () => {
  test('open while typing the leading token', () => {
    expect(menuQuery('/')).toBe('');
    expect(menuQuery('/co')).toBe('co');
    expect(menuQuery('/用')).toBe('用');
  });
  test('closed after whitespace, inline, or paths', () => {
    expect(menuQuery('/rename ')).toBeNull();
    expect(menuQuery('/rename\n')).toBeNull();
    expect(menuQuery('hi /co')).toBeNull();
    expect(menuQuery('/usr/bin')).toBeNull();
    expect(menuQuery('')).toBeNull();
  });
});

describe('expandPrompt', () => {
  test('placeholder', () => {
    expect(expandPrompt('在树洞搜索「{{input}}」并总结', '考试')).toBe('在树洞搜索「考试」并总结');
  });
  test('the input joins the template naturally', () => {
    expect(expandPrompt('Find me a free classroom to study in{{input}} (if I didn’t say when, I mean now)', 'Science Teaching Building tomorrow morning')).toBe(
      'Find me a free classroom to study in: Science Teaching Building tomorrow morning (if I didn’t say when, I mean now)',
    );
    expect(expandPrompt('帮我找能自习的空闲教室{{input}}（没说时间就是现在）', '理教 明天上午')).toBe('帮我找能自习的空闲教室：理教 明天上午（没说时间就是现在）');
    expect(expandPrompt('Sort them by deadline.{{input}}', 'Calculus only')).toBe('Sort them by deadline. Calculus only');
    expect(expandPrompt('按截止时间排好。{{input}}', '只看数学')).toBe('按截止时间排好。只看数学');
    // Empty input leaves no stray joiner.
    expect(expandPrompt('帮我找能自习的空闲教室{{input}}（没说时间就是现在）', '')).toBe('帮我找能自习的空闲教室（没说时间就是现在）');
  });
  test('no placeholder appends input', () => {
    expect(expandPrompt('校园卡还剩多少钱？', '')).toBe('校园卡还剩多少钱？');
    expect(expandPrompt('今天有什么课？', '下午')).toBe('今天有什么课？\n\n下午');
  });
});
