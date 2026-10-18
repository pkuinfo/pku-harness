import { useMemo, useSyncExternalStore } from 'react';

import { registry } from './registry';
import type { PluginDef } from './types';

// `version` is an explicit dependency: the React Compiler would otherwise memoize
// `registry.list()` forever, since the call has no visible inputs.

/** Re-renders when plugins are registered or removed. */
export function usePlugins(): PluginDef[] {
  const version = useSyncExternalStore(registry.subscribe, registry.version);
  return useMemo(() => (version >= 0 ? registry.list() : []), [version]);
}

export function usePlugin(id: string): PluginDef | undefined {
  const version = useSyncExternalStore(registry.subscribe, registry.version);
  return useMemo(() => (version >= 0 ? registry.get(id) : undefined), [version, id]);
}
