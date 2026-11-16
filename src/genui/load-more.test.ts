import { expect, test } from 'bun:test';

import { loadMore } from './load-more';

function store(initial: Record<string, unknown> = {}) {
  const state = new Map(Object.entries(initial));
  return { get: (p: string) => state.get(p), set: (p: string, v: unknown) => void state.set(p, v), state };
}
const params = { tool: 'treehole.latest', input: { limit: 2 }, listPath: '/more/latest', itemsKey: 'holes', statusPath: '/status', key: 'pid', basePath: '/feed/holes' };

test('pages from 2 on, skipping what page 1 or earlier pages already show, until an empty page', async () => {
  const s = store({ '/feed/holes': [{ pid: 9 }, { pid: 8 }] });
  const pages: Record<number, unknown[]> = { 2: [{ pid: 8 }, { pid: 7 }], 3: [{ pid: 7 }, { pid: 6 }], 4: [] };
  const calls: unknown[] = [];
  const invoke = async (tool: string, input: Record<string, unknown>) => (calls.push([tool, input]), { holes: pages[input.page as number] });
  for (let i = 0; i < 4; i++) await loadMore(s, params, invoke);
  expect(s.state.get('/more/latest')).toEqual([{ pid: 7 }, { pid: 6 }]);
  expect(s.state.get('/status')).toEqual({ page: 4, loading: false, done: true, error: null });
  // Done: the fourth call asked nothing.
  expect(calls).toEqual([['treehole.latest', { limit: 2, page: 2 }], ['treehole.latest', { limit: 2, page: 3 }], ['treehole.latest', { limit: 2, page: 4 }]]);
});

test('a failed page keeps the list and the page, so a retry asks for it again', async () => {
  const s = store();
  let fail = true;
  const invoke = async (_: string, input: Record<string, unknown>) => {
    if (fail) throw new Error('树洞：登录已过期');
    return { holes: [{ pid: input.page }] };
  };
  await loadMore(s, params, invoke);
  expect(s.state.get('/status')).toEqual({ loading: false, error: '树洞：登录已过期' });
  fail = false;
  await loadMore(s, params, invoke);
  expect(s.state.get('/more/latest')).toEqual([{ pid: 2 }]);
});

test('one page at a time, and bad paths do nothing', async () => {
  const s = store({ '/status': { page: 3, loading: true } });
  let called = false;
  await loadMore(s, params, async () => ((called = true), { holes: [] }));
  expect(called).toBe(false);
  expect(await loadMore(s, { ...params, listPath: 'more' }, async () => ({}))).toBeNull();
});
