import { useSyncExternalStore } from 'react';

import { useCampusAccount } from '@/core/campus/account';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import type { PluginDef } from '@/core/runtime/types';

import { pluginStatus, type PluginStatus } from './status';

export type PluginEntry = { plugin: PluginDef; status: PluginStatus; enabled: boolean };

/** Every registered plugin with its live status; re-renders on registry, settings and sign-in changes. */
export function usePluginEntries(): PluginEntry[] {
  const plugins = usePlugins();
  // `all` is read explicitly so the React Compiler sees the dependency (`get` reads the same store).
  const all = useSyncExternalStore(pluginSettings.subscribe, pluginSettings.snapshot);
  const { signedIn } = useCampusAccount();
  return plugins.map((plugin) => {
    const enabled = all ? pluginSettings.get(plugin.id).enabled : true;
    return { plugin, enabled, status: pluginStatus(plugin, { enabled, unavailable: !!registry.unavailable(plugin.id), signedIn }) };
  });
}

/** Live status of one plugin. */
export function usePluginStatus(plugin: PluginDef | undefined, enabled: boolean): PluginStatus {
  const { signedIn } = useCampusAccount();
  return plugin ? pluginStatus(plugin, { enabled, unavailable: !!registry.unavailable(plugin.id), signedIn }) : 'unavailable';
}
