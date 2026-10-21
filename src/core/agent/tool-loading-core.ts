/**
 * On-demand tool loading (docs/AGENT-HARNESS.md §5.1). Sending every plugin's tool schema on
 * every request cost ~20k tokens before the user said a word. The model sees a catalog of the
 * installed plugins in the system prompt, always has the core plugins' tools, and loads the
 * rest with `tools__load`; a session keeps what it loaded, so its tool block stays a stable,
 * cacheable prefix after the first load. Pure: no React Native, unit-tested.
 */

/** Always offered: generative UI, long-term memory, plugin management. */
export const CORE_PLUGINS: readonly string[] = ['ui', 'memory', 'plugins'];

/** The host's loader tool, model-facing name. */
export const LOAD_TOOL = 'tools__load';

/** At most this many plugins per load call (the schema says so too). */
export const MAX_LOAD = 8;

/** `campus-card__getBalance` → `campus-card`. */
export const pluginOfModelName = (name: string) => name.split('__', 1)[0];

/** Model-facing tool names to send: the loader, core plugins and what this session loaded. */
export function activeNames(names: readonly string[], loaded: readonly string[]): string[] {
  const on = new Set([...CORE_PLUGINS, ...loaded]);
  return names.filter((n) => n === LOAD_TOOL || on.has(pluginOfModelName(n)));
}

export type LoadOutcome = {
  /** Plugins whose tools are available from the next step on (newly loaded or already there). */
  loaded: string[];
  /** Ids that aren't installed, enabled and runnable here. */
  unknown: string[];
  /** The session's loaded list after this call (core plugins are never stored). */
  next: string[];
};

/** Resolve a load request against what's available and what the session already has. */
export function resolveLoad(requested: readonly string[], available: ReadonlySet<string>, already: readonly string[]): LoadOutcome {
  const ids = [...new Set(requested.map((r) => r.trim()).filter(Boolean))];
  const loaded = ids.filter((id) => available.has(id));
  const unknown = ids.filter((id) => !available.has(id));
  const next = [...new Set([...already, ...loaded.filter((id) => !CORE_PLUGINS.includes(id))])].sort();
  return { loaded, unknown, next };
}
