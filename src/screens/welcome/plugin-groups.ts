/**
 * Groups for the plugin step (pure, unit-tested): 校园服务 / 效率 / 系统. Model providers are set up
 * in the AI step and remote plugins are added later, so neither appears here.
 */

export type GroupId = 'campus' | 'productivity' | 'system';

export const GROUPS: { id: GroupId; title: string; footer?: string }[] = [
  { id: 'campus', title: '校园服务', footer: '需要登录北大账号；部分服务只在校园网内可用。' },
  { id: 'productivity', title: '效率' },
  { id: 'system', title: '系统', footer: '应用本身的一部分，始终开启。' },
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
export function groupPlugins<T extends PluginLike>(plugins: readonly T[]): { id: GroupId; title: string; footer?: string; plugins: T[] }[] {
  return GROUPS.map((g) => ({ ...g, plugins: plugins.filter((p) => groupOf(p) === g.id) })).filter((g) => g.plugins.length > 0);
}

/** Device requirements worth a badge (plain internet access is assumed, so not shown). */
const BADGE: Record<string, string> = {
  'campus-session': '需登录',
  'campus-network': '仅校园网',
  notifications: '通知',
  background: '后台',
};

export function requirementBadges(p: PluginLike): string[] {
  return (p.requires ?? []).map((c) => BADGE[c]).filter((b): b is string => !!b);
}
