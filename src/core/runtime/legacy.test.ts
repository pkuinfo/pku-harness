/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { Job, Widget } from '@pku-harness/sdk';

import { buildAliases, duplicatePluginWidgets, migrateJob, migrateLegacySettings, migrateWidget } from './legacy';

const tool = { title: 't', description: 'd', effect: 'read' } as never;
const wallet = {
  id: 'wallet',
  tools: { cardBalance: tool, netfeeBalance: tool, bathRecharge: tool },
  contributes: { widgets: { card: {}, netfee: {} } },
  legacy: {
    pluginIds: ['campus-card', 'netfee', 'utilities'],
    tools: { 'campus-card.getBalance': 'cardBalance', 'netfee.getStatus': 'netfeeBalance', 'utilities.rechargeBath': 'bathRecharge', 'campus-card.gone': 'missing' },
    widgets: { 'campus-card.balance': 'card', 'netfee.balance': 'netfee' },
  },
};

describe('legacy aliases', () => {
  test('old plugin, tool and widget ids map to the successor', () => {
    const a = buildAliases([wallet]);
    expect(a.plugins.get('campus-card')).toBe('wallet');
    expect(a.plugins.get('utilities')).toBe('wallet');
    expect(a.tools.get('campus-card.getBalance')).toBe('wallet.cardBalance');
    expect(a.tools.get('netfee.getStatus')).toBe('wallet.netfeeBalance');
    expect(a.widgets.get('netfee.balance')).toEqual({ plugin: 'wallet', widget: 'netfee' });
  });
  test('targets that do not exist are dropped', () => {
    expect(buildAliases([wallet]).tools.has('campus-card.gone')).toBe(false);
  });
  test('an installed plugin with an old id is never shadowed', () => {
    const a = buildAliases([wallet, { id: 'netfee', tools: { getStatus: tool } }]);
    expect(a.plugins.has('netfee')).toBe(false);
    expect(a.tools.has('netfee.getStatus')).toBe(false);
    expect(a.widgets.has('netfee.balance')).toBe(false);
    expect(a.plugins.get('campus-card')).toBe('wallet');
  });
  test('no legacy, no aliases', () => {
    const a = buildAliases([{ id: 'todo', tools: { list: tool } }]);
    expect(a.plugins.size + a.tools.size + a.widgets.size).toBe(0);
  });
});

type S = { enabled: boolean; modes: Record<'read' | 'write' | 'money' | 'public', 'auto' | 'ask' | 'off'> };
const defaults: S = { enabled: true, modes: { read: 'auto', write: 'auto', money: 'auto', public: 'auto' } };
const s = (enabled: boolean, modes: Partial<S['modes']> = {}): S => ({ enabled, modes: { ...defaults.modes, ...modes } });

describe('settings migration', () => {
  const aliases = buildAliases([wallet]);
  test('strictest mode per effect, enabled if any old plugin was', () => {
    const stored = { 'campus-card': s(false, { money: 'ask' }), utilities: s(true, { money: 'off', write: 'ask' }), netfee: s(false) };
    const out = migrateLegacySettings(stored, aliases, defaults);
    expect(out.wallet).toEqual({ enabled: true, modes: { read: 'auto', write: 'ask', money: 'off', public: 'auto' } });
    expect(out['campus-card']).toEqual(stored['campus-card']);
  });
  test('all stored ones disabled, the rest at the default (enabled) → enabled', () => {
    expect(migrateLegacySettings({ 'campus-card': s(false) }, aliases, defaults).wallet.enabled).toBe(true);
  });
  test('every old plugin disabled → disabled', () => {
    const out = migrateLegacySettings({ 'campus-card': s(false), netfee: s(false), utilities: s(false) }, aliases, defaults);
    expect(out.wallet.enabled).toBe(false);
  });
  test('runs once: existing successor settings win, and the result is stable', () => {
    const stored = { 'campus-card': s(false), wallet: s(true) };
    expect(migrateLegacySettings(stored, aliases, defaults)).toBe(stored);
    const once = migrateLegacySettings({ netfee: s(true, { read: 'ask' }) }, aliases, defaults);
    expect(migrateLegacySettings(once, aliases, defaults)).toBe(once);
  });
  test('nothing stored for old plugins → unchanged', () => {
    const stored = { todo: s(true) };
    expect(migrateLegacySettings(stored, aliases, defaults)).toBe(stored);
  });
});

const widget = (over: Partial<Widget>): Widget => ({ id: 'w', title: 'W', size: 'md', spec: {}, bindings: {}, position: 0, createdAt: 1, updatedAt: 1, ...over });

describe('stored widgets and jobs', () => {
  const aliases = buildAliases([wallet]);
  test('plugin widget source is rewritten, config kept', () => {
    const out = migrateWidget(widget({ source: { plugin: 'netfee', widget: 'balance', config: { x: 1 } } }), aliases);
    expect(out?.source).toEqual({ plugin: 'wallet', widget: 'netfee', config: { x: 1 } });
  });
  test('AI widget bindings are rewritten, others untouched', () => {
    const out = migrateWidget(widget({ bindings: { '/card': { tool: 'campus-card.getBalance', path: 'balance', ttlMinutes: 5 }, '/today': { tool: 'calendar.today' } } }), aliases);
    expect(out?.bindings).toEqual({ '/card': { tool: 'wallet.cardBalance', path: 'balance', ttlMinutes: 5 }, '/today': { tool: 'calendar.today' } });
    expect(migrateWidget(out!, aliases)).toBeNull();
  });
  test('widgets without old ids need nothing', () => {
    expect(migrateWidget(widget({ bindings: { '/x': { tool: 'calendar.today' } } }), aliases)).toBeNull();
    expect(migrateWidget(widget({ source: { plugin: 'wallet', widget: 'card' } }), aliases)).toBeNull();
  });
  test('check jobs on an old tool are rewritten once', () => {
    const job = { id: 'j', action: { type: 'check', tool: 'campus-card.getBalance', condition: { path: 'balance', op: 'lt', value: 100 }, title: '余额' } } as unknown as Job;
    const out = migrateJob(job, aliases);
    expect(out?.action).toMatchObject({ type: 'check', tool: 'wallet.cardBalance', condition: { path: 'balance', op: 'lt', value: 100 } });
    expect(migrateJob(out!, aliases)).toBeNull();
    expect(migrateJob({ id: 'n', action: { type: 'notify' } } as unknown as Job, aliases)).toBeNull();
  });
});

describe('duplicate plugin widgets', () => {
  const pw = (id: string, position: number, widget: string, config?: Record<string, unknown>): Widget =>
    ({ id, title: id, size: 'sm', spec: {}, bindings: {}, source: { plugin: 'wallet', widget, config }, position, createdAt: 0, updatedAt: 0 }) as Widget;
  test('later identical copies are reported, first kept; configs compare by value', () => {
    const ws = [pw('b', 2, 'card'), pw('a', 1, 'card'), pw('c', 3, 'netfee'), pw('d', 4, 'netfee', { x: 1, y: 2 }), pw('e', 5, 'netfee', { y: 2, x: 1 })];
    expect(duplicatePluginWidgets(ws)).toEqual(['b', 'e']);
  });
  test('AI-built widgets (no source) are never touched', () => {
    const ai = { id: 'x', title: 'x', size: 'sm', spec: {}, bindings: {}, position: 1, createdAt: 0, updatedAt: 0 } as Widget;
    expect(duplicatePluginWidgets([ai, { ...ai, id: 'y' }])).toEqual([]);
  });
});
