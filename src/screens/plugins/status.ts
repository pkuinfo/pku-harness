/**
 * Plugin status and grouping for the plugins page and the Settings summary (pure, unit-tested).
 * Everything is derived from the manifest fields (`core`, `remote`, `providers`, `requires`),
 * never from plugin ids, so renamed or merged plugins land in the right place on their own.
 */
import type { ChipTone } from '@/components/chip';
import type { MessageKey } from '@/i18n';

/** The manifest fields status and grouping need (a subset of PluginDef, so tests need no runtime). */
export type PluginLike = {
  id: string;
  core?: boolean;
  requires?: readonly string[];
  providers?: Record<string, unknown>;
  remote?: unknown;
};

/** One-line state of a plugin, most important first. */
export type PluginStatus = 'unavailable' | 'off' | 'signIn' | 'campusNetwork' | 'on';

export function pluginStatus(p: PluginLike, { enabled, unavailable, signedIn }: { enabled: boolean; unavailable: boolean; signedIn: boolean }): PluginStatus {
  if (unavailable) return 'unavailable';
  if (!enabled && !p.core) return 'off';
  if (!signedIn && p.requires?.includes('campus-session')) return 'signIn';
  if (p.requires?.includes('campus-network')) return 'campusNetwork';
  return 'on';
}

export const STATUS_LABEL: Record<PluginStatus, MessageKey> = {
  unavailable: 'app.plugins.status.unavailable',
  off: 'app.plugins.status.off',
  signIn: 'app.plugins.status.signIn',
  campusNetwork: 'app.plugins.status.campusNetwork',
  on: 'app.plugins.status.on',
};

/** Dot / chip colour per status. Always shown next to the label, never colour alone. */
export const STATUS_TONE: Record<PluginStatus, ChipTone> = {
  unavailable: 'neutral',
  off: 'neutral',
  signIn: 'warn',
  campusNetwork: 'info',
  on: 'up',
};

/** The plugin is running (it may still only answer on the campus network). */
export const isRunning = (s: PluginStatus) => s === 'on' || s === 'campusNetwork';

export type GroupId = 'services' | 'system' | 'ai' | 'remote';

export const GROUPS: { id: GroupId; title: MessageKey; footer?: MessageKey }[] = [
  { id: 'services', title: 'app.plugins.services' },
  { id: 'system', title: 'app.plugins.core', footer: 'app.plugins.coreFooter' },
  { id: 'ai', title: 'app.plugins.ai', footer: 'app.plugins.aiFooter' },
  { id: 'remote', title: 'app.plugins.remote', footer: 'app.plugins.remoteFooter' },
];

export function groupOf(p: PluginLike): GroupId {
  if (p.remote) return 'remote';
  if (p.core) return 'system';
  if (p.providers) return 'ai';
  return 'services';
}

/** Tile tint per group, so the grid reads as sections at a glance. */
export const GROUP_TONE: Record<GroupId, ChipTone> = { services: 'accent', system: 'neutral', ai: 'warn', remote: 'info' };

/** Plugins bucketed by group in registry order. `keepEmpty` keeps groups with no plugins (Remote holds the add tiles). */
export function groupPlugins<T extends PluginLike>(plugins: readonly T[], keepEmpty: GroupId[] = []): { id: GroupId; title: MessageKey; footer?: MessageKey; plugins: T[] }[] {
  return GROUPS.map((g) => ({ ...g, plugins: plugins.filter((p) => groupOf(p) === g.id) })).filter((g) => g.plugins.length > 0 || keepEmpty.includes(g.id));
}

/** Counts for the Settings entry: how many run, how many wait for the campus sign-in. */
export function summarize(statuses: readonly PluginStatus[]) {
  return { on: statuses.filter(isRunning).length, signIn: statuses.filter((s) => s === 'signIn').length, total: statuses.length };
}

/** Case-insensitive match on any of the given texts (shown name, source name, description, id). */
export function matches(query: string, texts: readonly (string | undefined)[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((s) => s?.toLowerCase().includes(q));
}

/** Grid columns for a content width: two on phones, more on wide screens. */
export const columnsFor = (width: number) => (width >= 640 ? 4 : width >= 460 ? 3 : 2);
