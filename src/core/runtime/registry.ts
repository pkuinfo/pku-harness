import CampusHttpModule from '../../../modules/campus-http';

import { t, type MessageKey } from '@/i18n';

import { modelText, providerText } from './localize';
import type { Capability, CommandContribution, PluginDef, ProviderDef, ToolDef } from './types';

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
  // The authenticated campus session needs the native module (modules/campus-http): present on
  // Android builds; iOS gets it once the Swift port lands (docs/IOS.md).
  ...(CampusHttpModule != null ? (['campus-session'] as const) : []),
]);

const CAPABILITY_LABEL: Record<Capability, MessageKey> = {
  network: 'app.plugins.capability.network',
  'campus-network': 'app.plugins.capability.campusNetwork',
  'campus-session': 'app.plugins.capability.campusSession',
  notifications: 'app.plugins.capability.notifications',
  background: 'app.plugins.capability.background',
  shell: 'app.plugins.capability.shell',
  filesystem: 'app.plugins.capability.filesystem',
};

export type ProviderEntry = { id: string; pluginId: string; def: ProviderDef };
/** A plugin's `contributes.commands` entry; the commands module names and filters them. */
export type CommandEntry = { pluginId: string; name: string; def: CommandContribution };

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
  /** Why a plugin can't run on this device (in the app language), or null. */
  unavailable(id: string): string | null {
    const missing = (plugins.get(id)?.requires ?? []).filter((c) => !HOST_CAPABILITIES.has(c));
    return missing.length ? t('app.plugins.unsupported', { list: missing.map((c) => t(CAPABILITY_LABEL[c])).join(t('app.ui.listSep')) }) : null;
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
    // Display strings (name, description, credential hint, model names) in the app language,
    // from the plugin's i18n overlay; ids and factories are untouched.
    return this.list().flatMap((p) =>
      Object.entries(p.providers ?? {}).map(([key, def]) => {
        const text = providerText(p, key, def);
        const models = def.models.map((m) => ({ ...m, ...modelText(p, key, m) }));
        return { id: `${p.id}.${key}`, pluginId: p.id, def: { ...def, ...text, models } };
      }),
    );
  },
  /** Slash commands contributed by all registered plugins, in plugin order. */
  commands(): CommandEntry[] {
    return this.list().flatMap((p) => Object.entries(p.contributes?.commands ?? {}).map(([name, def]) => ({ pluginId: p.id, name, def })));
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
