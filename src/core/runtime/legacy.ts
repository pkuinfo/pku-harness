/**
 * Ids that plugins replaced (`PluginDef.legacy`, e.g. campus-card + netfee + utilities → wallet).
 * Pure helpers so the registry, plugin settings and the boot migration share one definition and
 * tests need no runtime. Installed plugins always win over an alias with the same id.
 */
import type { Binding, Job, PluginDef, Widget } from '@pku-harness/sdk';

type PluginLike = Pick<PluginDef, 'id' | 'tools' | 'legacy'> & { contributes?: { widgets?: Record<string, unknown> } };

export type LegacyAliases = {
  /** Old plugin id → current plugin id. */
  plugins: Map<string, string>;
  /** Old full tool id → current full tool id. */
  tools: Map<string, string>;
  /** Old `<plugin>.<widget>` → current plugin + widget key. */
  widgets: Map<string, { plugin: string; widget: string }>;
};

/** Alias tables for the given plugins; ids of installed plugins and tools are never aliased. */
export function buildAliases(plugins: readonly PluginLike[]): LegacyAliases {
  const installed = new Set(plugins.map((p) => p.id));
  const out: LegacyAliases = { plugins: new Map(), tools: new Map(), widgets: new Map() };
  for (const p of plugins) {
    const l = p.legacy;
    if (!l) continue;
    for (const old of l.pluginIds ?? []) if (!installed.has(old) && !out.plugins.has(old)) out.plugins.set(old, p.id);
    for (const [old, name] of Object.entries(l.tools ?? {})) {
      if (installed.has(pluginOf(old)) || !p.tools[name] || out.tools.has(old)) continue;
      out.tools.set(old, `${p.id}.${name}`);
    }
    for (const [old, widget] of Object.entries(l.widgets ?? {})) {
      if (installed.has(pluginOf(old)) || !p.contributes?.widgets?.[widget] || out.widgets.has(old)) continue;
      out.widgets.set(old, { plugin: p.id, widget });
    }
  }
  return out;
}

const pluginOf = (id: string) => {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(0, dot);
};

// ── Settings ────────────────────────────────────────────────────────────────────────────────

type Mode = 'auto' | 'ask' | 'off';
type Settings = { enabled: boolean; modes: Record<string, Mode> };
const STRICTNESS: Record<Mode, number> = { auto: 0, ask: 1, off: 2 };

/**
 * Carry stored settings of replaced plugins over to their successor, once: only when the
 * successor has nothing stored yet. Enabled if any old plugin was effectively enabled (a missing
 * entry counts as the default, enabled); per effect the strictest stored mode wins. Old entries
 * stay (harmless; a downgrade still finds them). Returns the same object when nothing changed.
 */
export function migrateLegacySettings<S extends Settings>(stored: Record<string, S>, aliases: LegacyAliases, defaults: S): Record<string, S> {
  const byTarget = new Map<string, string[]>();
  for (const [old, target] of aliases.plugins) byTarget.set(target, [...(byTarget.get(target) ?? []), old]);
  let next = stored;
  for (const [target, olds] of byTarget) {
    if (stored[target]) continue;
    const found = olds.map((id) => stored[id]).filter((s): s is S => !!s);
    if (!found.length) continue;
    const enabled = olds.some((id) => stored[id]?.enabled ?? defaults.enabled);
    const modes: Record<string, Mode> = { ...defaults.modes };
    for (const s of found) {
      for (const [effect, mode] of Object.entries(s.modes ?? {})) {
        if (STRICTNESS[mode] > STRICTNESS[modes[effect] ?? 'auto']) modes[effect] = mode;
      }
    }
    next = { ...next, [target]: { ...defaults, ...found[0], enabled, modes } };
  }
  return next;
}

// ── Stored widgets and jobs ─────────────────────────────────────────────────────────────────

/** A widget with old plugin/tool ids rewritten, or null when it has none. */
export function migrateWidget(w: Widget, aliases: LegacyAliases): Widget | null {
  let changed = false;
  let source = w.source;
  if (source) {
    const to = aliases.widgets.get(`${source.plugin}.${source.widget}`);
    if (to) {
      source = { ...source, ...to };
      changed = true;
    }
  }
  const bindings: Record<string, Binding> = {};
  for (const [pointer, b] of Object.entries(w.bindings ?? {})) {
    const tool = aliases.tools.get(b.tool);
    bindings[pointer] = tool ? { ...b, tool } : b;
    if (tool) changed = true;
  }
  return changed ? { ...w, source, bindings } : null;
}

/** A job whose check action calls an old tool id, rewritten; null when it needs nothing. */
export function migrateJob(job: Job, aliases: LegacyAliases): Job | null {
  if (job.action.type !== 'check') return null;
  const tool = aliases.tools.get(job.action.tool);
  return tool ? { ...job, action: { ...job.action, tool } } : null;
}
