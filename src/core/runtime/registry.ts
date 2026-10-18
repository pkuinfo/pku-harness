import type { PluginDef, ToolDef } from './types';

export type ToolEntry = { id: string; pluginId: string; name: string; def: ToolDef };

const plugins = new Map<string, PluginDef>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export const registry = {
  register(plugin: PluginDef) {
    plugins.set(plugin.id, plugin);
    emit();
  },
  unregister(id: string) {
    plugins.delete(id);
    emit();
  },
  get(id: string) {
    return plugins.get(id);
  },
  list(): PluginDef[] {
    return [...plugins.values()];
  },
  /** Resolve `<plugin>.<tool>`. */
  tool(id: string): ToolEntry | undefined {
    const dot = id.indexOf('.');
    if (dot < 0) return undefined;
    const pluginId = id.slice(0, dot);
    const name = id.slice(dot + 1);
    const def = plugins.get(pluginId)?.tools[name];
    return def ? { id, pluginId, name, def } : undefined;
  },
  tools(): ToolEntry[] {
    return this.list().flatMap((p) =>
      Object.entries(p.tools).map(([name, def]) => ({ id: `${p.id}.${name}`, pluginId: p.id, name, def })),
    );
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  version: () => version,
};
