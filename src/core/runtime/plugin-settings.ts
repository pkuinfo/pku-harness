import { useSyncExternalStore } from 'react';

import { kv } from '@/core/store/kv';

import { migrateLegacySettings } from './legacy';
import { registry } from './registry';
import type { ToolEffect } from './types';

/** Per effect: run directly, ask the user in the UI first, or never run. */
export type EffectMode = 'auto' | 'ask' | 'off';

export type PluginSettings = {
  enabled: boolean;
  modes: Record<ToolEffect, EffectMode>;
  /** PKU Harness Cloud consent (docs/CLOUD.md §2.5); absent = never asked. */
  cloud?: { granted: boolean; at: number };
};

/** Product decision (docs/ARCHITECTURE.md §5): after onboarding consent, everything runs directly. */
export const DEFAULT_SETTINGS: PluginSettings = {
  enabled: true,
  modes: { read: 'auto', write: 'auto', money: 'auto', public: 'auto' },
};

const store = kv('plugin-settings');
let cache: Record<string, PluginSettings> = {};
const listeners = new Set<() => void>();

export const pluginSettings = {
  /** Read stored settings; call after the built-in plugins are registered (legacy migration). */
  async load() {
    const stored = (await store.get<Record<string, PluginSettings>>('all')) ?? {};
    // Merged plugins (PluginDef.legacy): carry the old plugins' choices over once.
    cache = migrateLegacySettings(stored, registry.aliases(), DEFAULT_SETTINGS);
    listeners.forEach((l) => l());
    if (cache !== stored) await store.set('all', cache);
  },
  get(pluginId: string): PluginSettings {
    const id = registry.canonicalId(pluginId);
    return resolve(id, cache[id]);
  },
  async update(pluginId: string, patch: Partial<PluginSettings>) {
    pluginId = registry.canonicalId(pluginId);
    const current = this.get(pluginId);
    cache = { ...cache, [pluginId]: { ...current, ...patch, modes: { ...current.modes, ...patch.modes } } };
    listeners.forEach((l) => l());
    await store.set('all', cache);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: () => cache,
};

/** Stored settings over the plugin's manifest defaults; core plugins are always enabled. */
function resolve(pluginId: string, stored: PluginSettings | undefined): PluginSettings {
  const def = registry.get(pluginId);
  const base: PluginSettings = { ...DEFAULT_SETTINGS, modes: { ...DEFAULT_SETTINGS.modes, ...def?.defaultModes } };
  const merged = stored ? { ...base, ...stored, modes: { ...base.modes, ...stored.modes } } : base;
  return def?.core ? { ...merged, enabled: true } : merged;
}

export function usePluginSettings(pluginId: string): PluginSettings {
  const all = useSyncExternalStore(pluginSettings.subscribe, pluginSettings.snapshot);
  const id = registry.canonicalId(pluginId);
  return resolve(id, all[id]);
}
