import { tool, type ToolSet } from 'ai';

import { invokeTool, services } from '@/core/runtime/invoke';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { resolveDynamic, type TurnInfo } from '@/core/runtime/types';

import { byStability } from './context/assembly';
import { dropModelImage, type ToolImages } from './tool-images';

/** Model-facing tool names can't contain dots: `wallet.cardBalance` → `wallet__cardBalance`. */
export const toModelName = (id: string) => id.replace('.', '__');
export const fromModelName = (name: string) => name.replace('__', '.');

/** Limits for this request's offered tools, frozen before streaming starts. */
export function agentToolStepLimits(names: Iterable<string>): Map<string, number> {
  const limits = new Map<string, number>();
  for (const name of names) {
    const entry = registry.tool(fromModelName(name));
    const requested = entry && registry.get(entry.pluginId)?.maxAgentSteps;
    if (requested !== undefined) limits.set(name, requested);
  }
  return limits;
}

/**
 * Every enabled plugin tool, sorted by id; execution goes through `invokeTool`. The block is the
 * same for every request until the user changes plugins in Settings: DeepSeek renders it right
 * after the system prompt, so narrowing or reordering it per turn would invalidate the cached
 * conversation behind it (docs/AGENT-HARNESS.md §5.1). `turn` is the chat turn's taint state
 * (docs/AGENT-HARNESS.md §5.7), shared by every call the agent makes in it. `images` (a chat reply
 * only) takes images tools hand to the model (./tool-images.ts); without it they are dropped.
 */
export function buildToolSet(signal?: AbortSignal, turn?: TurnInfo, actor: 'agent' | 'scheduler' = 'agent', images?: ToolImages): ToolSet {
  const set: ToolSet = {};
  // Most stable plugins first (core → bundled → remote), then by tool id: installing or turning
  // off a plugin changes the block as late as possible (assembly.ts).
  const rank = new Map(registry.list().slice().sort(byStability).map((p, i) => [p.id, i]));
  const entries = [...registry.tools()].sort((a, b) => (rank.get(a.pluginId) ?? 0) - (rank.get(b.pluginId) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const entry of entries) {
    // Only what the user enabled and this device can run is offered to the model.
    if (!pluginSettings.get(entry.pluginId).enabled || registry.unavailable(entry.pluginId)) continue;
    // Gates only the user may open (approving a memory) are never offered to the model.
    if (entry.def.userOnly) continue;
    set[toModelName(entry.id)] = tool({
      description: `${entry.def.title}. ${resolveDynamic(entry.def.description, services)}`,
      inputSchema: entry.def.input,
      execute: async (input: unknown, { toolCallId }) => {
        try {
          const out = await invokeTool(entry.id, input, { actor, signal, turn });
          // A model image never stays in the output (shown, stored, sent as tool text). Only bundled
          // plugins may pass one, in a chat reply (§ tool-images.ts).
          if (!images || registry.get(entry.pluginId)?.remote) return dropModelImage(out);
          return images.accept(out, { callId: toolCallId, toolId: entry.id, acceptsImages: !!turn?.acceptsImages });
        } catch (e) {
          // Return errors as data so the model can explain or recover.
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    });
  }
  return set;
}
