import { describe, expect, test } from 'bun:test';

import { alignmentScore, rankCommands } from './rank';

const c = (name: string, ...aliases: string[]) => ({ name, aliases });
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe('alignmentScore', () => {
  test('ordered subsequence only', () => {
    expect(alignmentScore('compact', 'cpt')).toBeDefined();
    expect(alignmentScore('compact', 'tpc')).toBeUndefined();
    expect(alignmentScore('ab', 'abc')).toBeUndefined();
  });
  test('adjacent beats gapped', () => {
    expect(alignmentScore('context', 'con')!).toBeGreaterThan(alignmentScore('compact-on', 'con')!);
  });
  test('CJK by character', () => {
    expect(alignmentScore('重新生成', '生成')).toBeDefined();
    expect(alignmentScore('重新生成', '成生')).toBeUndefined();
  });
});

describe('rankCommands', () => {
  const list = [c('new', '新对话'), c('compact', '压缩'), c('context', '上下文'), c('copy', '复制'), c('usage', '用量', '统计'), c('treehole:search', '树洞'), c('retry', '重新生成')];

  test('empty query returns everything in source order', () => {
    expect(names(rankCommands(list, ''))).toEqual(names(list));
  });
  test('prefix matches first', () => {
    const out = names(rankCommands(list, 'co'));
    expect(out.slice(0, 3).sort()).toEqual(['compact', 'context', 'copy']);
  });
  test('prefix beats a higher-scoring non-prefix', () => {
    // Source order puts 'xco' first; the prefix hit still ranks above it.
    expect(names(rankCommands([c('xco'), c('co')], 'co'))).toEqual(['co', 'xco']);
  });
  test('aliases match (Chinese)', () => {
    expect(names(rankCommands(list, '统计'))).toEqual(['usage']);
    expect(names(rankCommands(list, '生成'))).toEqual(['retry']);
  });
  test('bare part of a prefixed plugin name counts as prefix', () => {
    expect(names(rankCommands(list, 'sea'))[0]).toBe('treehole:search');
  });
  test('case-insensitive', () => {
    expect(names(rankCommands(list, 'NEW'))).toEqual(['new']);
  });
  test('no match is empty', () => {
    expect(rankCommands(list, 'zzz')).toEqual([]);
  });
});
