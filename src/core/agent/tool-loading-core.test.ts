import { describe, expect, test } from 'bun:test';

import { activeNames, LOAD_TOOL, pluginOfModelName, resolveLoad } from './tool-loading-core';

describe('activeNames', () => {
  const names = [LOAD_TOOL, 'campus-card__getBalance', 'memory__remember', 'treehole__post', 'ui__render'];
  test('core plugins and the loader are always on', () => {
    expect(activeNames(names, [])).toEqual([LOAD_TOOL, 'memory__remember', 'ui__render']);
  });
  test('loaded plugins join, order kept (stable cache prefix)', () => {
    expect(activeNames(names, ['campus-card'])).toEqual([LOAD_TOOL, 'campus-card__getBalance', 'memory__remember', 'ui__render']);
  });
  test('plugin of a model name', () => {
    expect(pluginOfModelName('room-booking__reserve')).toBe('room-booking');
  });
});

describe('resolveLoad', () => {
  const available = new Set(['campus-card', 'treehole', 'ui', 'memory']);
  test('loads available ids, reports unknown ones', () => {
    expect(resolveLoad(['treehole', 'nope', 'treehole '], available, [])).toEqual({ loaded: ['treehole'], unknown: ['nope'], next: ['treehole'] });
  });
  test('keeps what was loaded before, sorted, without core plugins', () => {
    expect(resolveLoad(['campus-card', 'ui'], available, ['treehole']).next).toEqual(['campus-card', 'treehole']);
  });
});
