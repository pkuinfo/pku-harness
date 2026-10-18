import { tool, type ToolSet } from 'ai';

import { invokeTool, services } from '@/core/runtime/invoke';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { resolveDynamic } from '@/core/runtime/types';

/** Model-facing tool names can't contain dots: `campus-card.getBalance` → `campus-card__getBalance`. */
export const toModelName = (id: string) => id.replace('.', '__');
export const fromModelName = (name: string) => name.replace('__', '.');

/** Expose every enabled plugin tool to the model; execution goes through `invokeTool`. */
export function buildToolSet(signal?: AbortSignal): ToolSet {
  const set: ToolSet = {};
  for (const entry of registry.tools()) {
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
