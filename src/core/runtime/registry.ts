import { Platform } from 'react-native';

import type { Capability, PluginDef, ProviderDef, ToolDef } from './types';

export type ToolEntry = { id: string; pluginId: string; name: string; def: ToolDef };
/**
 * What this device can give plugins. A phone has no shell or filesystem for plugins, and the
 * authenticated campus session needs the campus-http native module (Android today).
 */
export const HOST_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'network',
  'campus-network',
  'notifications',
  'background',
  // modules/campus-http is Android-only for now.
  ...(Platform.OS === 'android' ? (['campus-session'] as const) : []),
]);

const CAPABILITY_LABEL: Record<Capability, string> = {
  network: '网络',
  'campus-network': '校园网',
  'campus-session': '校园账号登录',
  notifications: '通知',
  background: '后台运行',
  shell: '命令行',
  filesystem: '文件系统',
};

export type ProviderEntry = { id: string; pluginId: string; def: ProviderDef };

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
  /** Why a plugin can't run on this device, or null. */
  unavailable(id: string): string | null {
    const missing = (plugins.get(id)?.requires ?? []).filter((c) => !HOST_CAPABILITIES.has(c));
    return missing.length ? `需要${missing.map((c) => CAPABILITY_LABEL[c]).join('、')}，这台设备暂不支持` : null;
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
  /** Provider ids are `<plugin>.<provider>`. */
  providers(): ProviderEntry[] {
    return this.list().flatMap((p) => Object.entries(p.providers ?? {}).map(([key, def]) => ({ id: `${p.id}.${key}`, pluginId: p.id, def })));
  },
  provider(id: string): ProviderEntry | undefined {
    return this.providers().find((p) => p.id === id);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  version: () => version,
};
