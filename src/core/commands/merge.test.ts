import { describe, expect, test } from 'bun:test';

import { mergeCommands, type PluginCommandEntry } from './merge';
import type { Command, CommandContext } from './types';

const builtin = (name: string): Command => ({ name, aliases: [], description: name, group: 'session', run: () => ({ kind: 'done' }) });
const ctx: CommandContext = { sessionId: 's', navigate: () => {}, setDraft: () => {} };
const prompt = (pluginId: string, name: string, p = 'hi {{input}}', extra = {}): PluginCommandEntry => ({ pluginId, name, def: { description: name, prompt: p, ...extra } });

describe('mergeCommands', () => {
  test('built-ins first, plugin commands keep bare names when free', () => {
    const out = mergeCommands([builtin('new')], [prompt('wallet', 'balance')], async () => undefined);
    expect(out.map((c) => c.name)).toEqual(['new', 'balance']);
    expect(out[1]).toMatchObject({ group: 'plugin', pluginId: 'wallet' });
  });
  test('collision with a built-in becomes plugin:name', () => {
    const out = mergeCommands([builtin('new'), builtin('help')], [prompt('foo', 'help')], async () => undefined);
    expect(out.map((c) => c.name)).toEqual(['new', 'help', 'foo:help']);
  });
  test('collision between plugins prefixes every colliding plugin', () => {
    const out = mergeCommands([], [prompt('a', 'today'), prompt('b', 'today'), prompt('c', 'other')], async () => undefined);
    expect(out.map((c) => c.name)).toEqual(['a:today', 'b:today', 'other']);
  });
  test('invalid names are dropped', () => {
    const out = mergeCommands([], [prompt('a', 'Bad'), prompt('a', '1x'), prompt('a', 'ok-1')], async () => undefined);
    expect(out.map((c) => c.name)).toEqual(['ok-1']);
  });
  test('aliases with whitespace are dropped', () => {
    const out = mergeCommands([], [prompt('a', 'x', 'p', { aliases: ['今天', '今天 课表', ' 课表 '] })], async () => undefined);
    expect(out[0].aliases).toEqual(['今天', '课表']);
  });
  test('prompt commands expand input', async () => {
    const [c] = mergeCommands([], [prompt('treehole', 'treehole', '在树洞搜索「{{input}}」并总结')], async () => undefined);
    expect(await c.run('考试', ctx)).toEqual({ kind: 'prompt', text: '在树洞搜索「考试」并总结' });
  });
  test('local commands return their notice', async () => {
    const entry: PluginCommandEntry = { pluginId: 'p', name: 'ping', def: { description: 'ping', run: () => 'pong' } };
    const [c] = mergeCommands([], [entry], async (e, input) => `${e.name}:${input}`);
    expect(await c.run('x', ctx)).toEqual({ kind: 'done', notice: 'ping:x' });
  });
});
