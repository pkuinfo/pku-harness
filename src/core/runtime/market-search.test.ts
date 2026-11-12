import { describe, expect, test } from 'bun:test';

import { rankMarketplace, type FeedPlugin } from './market-rank';

const FEED: FeedPlugin[] = [
  { id: 'classrooms', name: '空闲教室', nameEn: 'Free classrooms', description: '查教学楼空闲教室', descriptionEn: 'Free rooms by building', official: true, verified: true, kind: 'builtin', source: 'https://github.com/pkuinfo/pku-harness-plugins/tree/main/plugins/classrooms' },
  { id: 'lib-seat', name: '图书馆座位', description: '查询图书馆空座', author: 'someone', tags: ['library'], kind: 'builtin', installUrl: 'https://github.com/someone/lib-seat' },
  { id: 'demo-canteen', name: '食堂演示', description: 'remote demo', kind: 'remote', endpoint: 'https://example.com/mcp', official: true },
];

describe('rankMarketplace', () => {
  test('matches names, descriptions and tags, best first', () => {
    expect(rankMarketplace(FEED, '教室', new Set(), 'zh-Hans').map((h) => h.id)).toEqual(['classrooms']);
    expect(rankMarketplace(FEED, 'library', new Set(), 'zh-Hans').map((h) => h.id)).toEqual(['lib-seat']);
    expect(rankMarketplace(FEED, 'free rooms', new Set(), 'en')[0]).toMatchObject({ id: 'classrooms', name: 'Free classrooms', official: true });
  });
  test('install link for documents, endpoint for remote plugins, installed flag', () => {
    const [seat] = rankMarketplace(FEED, '座位', new Set(['lib-seat']), 'zh-Hans');
    expect(seat).toMatchObject({ link: 'https://github.com/someone/lib-seat', endpoint: null, installed: true });
    const [demo] = rankMarketplace(FEED, 'demo', new Set(), 'zh-Hans');
    expect(demo).toMatchObject({ link: null, endpoint: 'https://example.com/mcp' });
  });
  test('empty query and no match give nothing', () => {
    expect(rankMarketplace(FEED, '  ', new Set(), 'zh-Hans')).toEqual([]);
    expect(rankMarketplace(FEED, 'quantum', new Set(), 'zh-Hans')).toEqual([]);
  });
});
