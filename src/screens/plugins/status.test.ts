import { describe, expect, test } from 'bun:test';

import { columnsFor, groupOf, groupPlugins, matches, pluginStatus, summarize } from './status';

const on = { enabled: true, unavailable: false, signedIn: true };

describe('pluginStatus', () => {
  test('unavailable beats everything', () => {
    expect(pluginStatus({ id: 'a', requires: ['campus-session'] }, { ...on, unavailable: true, enabled: false })).toBe('unavailable');
  });
  test('off unless core', () => {
    expect(pluginStatus({ id: 'a' }, { ...on, enabled: false })).toBe('off');
    expect(pluginStatus({ id: 'a', core: true }, { ...on, enabled: false })).toBe('on');
  });
  test('needs sign-in only when signed out and campus-session is required', () => {
    expect(pluginStatus({ id: 'a', requires: ['campus-session', 'network'] }, { ...on, signedIn: false })).toBe('signIn');
    expect(pluginStatus({ id: 'a', requires: ['network'] }, { ...on, signedIn: false })).toBe('on');
    expect(pluginStatus({ id: 'a', requires: ['campus-session'] }, on)).toBe('on');
  });
  test('campus network only', () => {
    expect(pluginStatus({ id: 'a', requires: ['campus-session', 'campus-network'] }, on)).toBe('campusNetwork');
  });
});

describe('grouping', () => {
  test('from manifest fields, not ids', () => {
    expect(groupOf({ id: 'x', remote: {} , core: true })).toBe('remote');
    expect(groupOf({ id: 'x', core: true })).toBe('system');
    expect(groupOf({ id: 'x', providers: {} })).toBe('ai');
    expect(groupOf({ id: 'wallet', requires: ['campus-session'] })).toBe('services');
  });
  test('drops empty groups unless kept, keeps order', () => {
    const groups = groupPlugins([{ id: 'b' }, { id: 'c', core: true }, { id: 'a' }], ['remote']);
    expect(groups.map((g) => g.id)).toEqual(['services', 'system', 'remote']);
    expect(groups[0].plugins.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

test('summarize', () => {
  expect(summarize(['on', 'campusNetwork', 'signIn', 'off', 'unavailable', 'signIn'])).toEqual({ on: 2, signIn: 2, total: 6 });
});

test('matches', () => {
  expect(matches('', ['x'])).toBe(true);
  expect(matches(' Card ', ['Campus card', undefined])).toBe(true);
  expect(matches('树洞', ['Treehole', '树洞'])).toBe(true);
  expect(matches('zzz', ['Treehole'])).toBe(false);
});

test('columnsFor', () => {
  expect(columnsFor(360)).toBe(2);
  expect(columnsFor(500)).toBe(3);
  expect(columnsFor(728)).toBe(4);
});
