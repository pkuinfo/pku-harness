/**
 * Groups for the plugin step (pure, unit-tested): 校园服务 / 效率 / 系统 (campus services,
 * productivity, system). Model providers are set up in the AI step and remote plugins are added
 * later, so neither appears here. Titles, footers and badges are dictionary keys; the screen
 * translates them.
 */
import type { MessageKey } from '@/i18n';


export type GroupId = 'campus' | 'productivity' | 'system';

type Group = { id: GroupId; title: MessageKey; footer?: MessageKey };

export const GROUPS: Group[] = [
  { id: 'campus', title: 'welcome.plugins.groups.campus', footer: 'welcome.plugins.groups.campusFooter' },
  { id: 'productivity', title: 'welcome.plugins.groups.productivity' },
  { id: 'system', title: 'welcome.plugins.groups.system', footer: 'welcome.plugins.groups.systemFooter' },
];

/** The fields grouping needs (a subset of PluginDef, so tests need no runtime). */
export type PluginLike = {
  id: string;
  core?: boolean;
  requires?: readonly string[];
  providers?: Record<string, unknown>;
  remote?: unknown;
};

/** Harness plumbing: tabs, generated UI, scheduling, plugin management. */
const SYSTEM = new Set(['ui', 'dashboard', 'schedule', 'scheduler', 'plugins']);
/** Campus-adjacent tools that are about the user's own workflow rather than a campus service. */
const PRODUCTIVITY = new Set(['authenticator']);

export function groupOf(p: PluginLike): GroupId | null {
  if (p.remote || p.providers) return null;
  if (SYSTEM.has(p.id)) return 'system';
  if (PRODUCTIVITY.has(p.id)) return 'productivity';
  const campus = p.requires?.some((c) => c === 'campus-session' || c === 'campus-network');
  if (campus || p.id === 'course-catalog') return 'campus';
  // Everything else (todo, timetable, calendar, memory…) helps the user get things done.
  return 'productivity';
}

/** Plugins bucketed by group, keeping registry order inside each group; empty groups dropped. */
export function groupPlugins<T extends PluginLike>(plugins: readonly T[]): (Group & { plugins: T[] })[] {
  return GROUPS.map((g) => ({ ...g, plugins: plugins.filter((p) => groupOf(p) === g.id) })).filter((g) => g.plugins.length > 0);
}

/** Device requirements worth a badge (plain internet access is assumed, so not shown). */
const BADGE: Record<string, MessageKey> = {
  'campus-session': 'welcome.plugins.badges.campusSession',
  'campus-network': 'welcome.plugins.badges.campusNetwork',
  notifications: 'welcome.plugins.badges.notifications',
  background: 'welcome.plugins.badges.background',
};

export function requirementBadges(p: PluginLike): MessageKey[] {
  return (p.requires ?? []).map((c) => BADGE[c]).filter((b): b is MessageKey => !!b);
}
