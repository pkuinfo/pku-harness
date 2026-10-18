import { useSyncExternalStore } from 'react';

import { kv } from '@/core/store/kv';

import type { ToolEffect } from './types';

/** Per effect: run directly, ask the user in the UI first, or never run. */
export type EffectMode = 'auto' | 'ask' | 'off';

export type PluginSettings = {
  enabled: boolean;
  modes: Record<ToolEffect, EffectMode>;
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
  async load() {
    cache = (await store.get<Record<string, PluginSettings>>('all')) ?? {};
    listeners.forEach((l) => l());
  },
  get(pluginId: string): PluginSettings {
    return cache[pluginId] ?? DEFAULT_SETTINGS;
  },
  async update(pluginId: string, patch: Partial<PluginSettings>) {
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

export function usePluginSettings(pluginId: string): PluginSettings {
  const all = useSyncExternalStore(pluginSettings.subscribe, pluginSettings.snapshot);
  return all[pluginId] ?? DEFAULT_SETTINGS;
}
