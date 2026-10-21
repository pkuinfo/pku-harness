import { tool, type ToolSet } from 'ai';

import { invokeTool, services } from '@/core/runtime/invoke';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { resolveDynamic } from '@/core/runtime/types';

import { byStability } from './context/assembly';

/** Model-facing tool names can't contain dots: `campus-card.getBalance` → `campus-card__getBalance`. */
export const toModelName = (id: string) => id.replace('.', '__');
export const fromModelName = (name: string) => name.replace('__', '.');

/**
 * Every enabled plugin tool, sorted by id; execution goes through `invokeTool`. The block is the
 * same for every request until the user changes plugins in Settings: DeepSeek renders it right
 * after the system prompt, so narrowing or reordering it per turn would invalidate the cached
 * conversation behind it (docs/AGENT-HARNESS.md §5.1).
 */
export function buildToolSet(signal?: AbortSignal): ToolSet {
  const set: ToolSet = {};
  // Most stable plugins first (core → bundled → remote), then by tool id: installing or turning
  // off a plugin changes the block as late as possible (assembly.ts).
  const rank = new Map(registry.list().slice().sort(byStability).map((p, i) => [p.id, i]));
  const entries = [...registry.tools()].sort((a, b) => (rank.get(a.pluginId) ?? 0) - (rank.get(b.pluginId) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const entry of entries) {
    // Only what the user enabled and this device can run is offered to the model.
    if (!pluginSettings.get(entry.pluginId).enabled || registry.unavailable(entry.pluginId)) continue;
    set[toModelName(entry.id)] = tool({
      description: `${entry.def.title}. ${resolveDynamic(entry.def.description, services)}`,
      inputSchema: entry.def.input,
      execute: async (input: unknown) => {
        try {
          return await invokeTool(entry.id, input, { actor: 'agent', signal });
        } catch (e) {
          // Return errors as data so the model can explain or recover.
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    });
  }
  return set;
}
