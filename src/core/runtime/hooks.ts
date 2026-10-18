import { useSyncExternalStore } from 'react';

import { registry } from './registry';
import type { PluginDef } from './types';

/** Re-renders when plugins are registered or removed. */
export function usePlugins(): PluginDef[] {
  useSyncExternalStore(registry.subscribe, registry.version);
  return registry.list();
}

export function usePlugin(id: string): PluginDef | undefined {
  useSyncExternalStore(registry.subscribe, registry.version);
  return registry.get(id);
}
