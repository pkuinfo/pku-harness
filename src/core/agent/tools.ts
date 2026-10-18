import { tool, type ToolSet } from 'ai';

import { invokeTool } from '@/core/runtime/invoke';
import { registry } from '@/core/runtime/registry';

/** Model-facing tool names can't contain dots: `campus-card.getBalance` → `campus-card__getBalance`. */
export const toModelName = (id: string) => id.replace('.', '__');
export const fromModelName = (name: string) => name.replace('__', '.');

/** Expose every enabled plugin tool to the model; execution goes through `invokeTool`. */
export function buildToolSet(signal?: AbortSignal): ToolSet {
  const set: ToolSet = {};
  for (const entry of registry.tools()) {
    set[toModelName(entry.id)] = tool({
      description: `${entry.def.title}. ${entry.def.description}`,
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
