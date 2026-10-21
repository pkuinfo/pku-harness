/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { groupOf, groupPlugins, requirementBadges } from './plugin-groups';

describe('plugin groups', () => {
  test('buckets by role, hiding providers and remote plugins', () => {
    expect(groupOf({ id: 'campus-card', requires: ['campus-session', 'network'] })).toBe('campus');
    expect(groupOf({ id: 'finance', requires: ['campus-session', 'campus-network'] })).toBe('campus');
    expect(groupOf({ id: 'course-catalog', requires: ['network'] })).toBe('campus');
    expect(groupOf({ id: 'authenticator', requires: ['campus-session'] })).toBe('productivity');
    expect(groupOf({ id: 'todo', core: true })).toBe('productivity');
    expect(groupOf({ id: 'ui', core: true })).toBe('system');
    expect(groupOf({ id: 'deepseek', providers: { api: {} } })).toBeNull();
    expect(groupOf({ id: 'mcp-x', remote: { url: 'https://x' } })).toBeNull();
  });

  test('keeps order and drops empty groups', () => {
    const groups = groupPlugins([
      { id: 'ui', core: true },
      { id: 'netfee', requires: ['campus-session'] },
      { id: 'campus-card', requires: ['campus-session'] },
    ]);
    expect(groups.map((g) => g.id)).toEqual(['campus', 'system']);
    expect(groups[0].plugins.map((p) => p.id)).toEqual(['netfee', 'campus-card']);
  });

  test('badges only for requirements worth mentioning', () => {
    expect(requirementBadges({ id: 'x', requires: ['network', 'campus-session', 'campus-network'] })).toEqual(['需登录', '仅校园网']);
    expect(requirementBadges({ id: 'y' })).toEqual([]);
  });
});
