/**
 * Plugins load into a chat on demand (docs/ARCHITECTURE.md §5.2). Core plugins are always
 * offered to the model; any other plugin is offered once this chat has loaded it, which the
 * history itself records: a successful `plugins__use` for it, or a call to one of its tools.
 * No separate state, so it survives restarts; a compaction that drops those messages unloads
 * the plugin again, and the model loads it back when it needs it.
 */
import type { ModelMessage } from 'ai';

const USE_TOOL = 'plugins__use';

/** Plugin id of a model-facing tool name (`wallet__cardBalance` → `wallet`). */
export const pluginOfTool = (name: string) => name.split('__')[0];

type Part = { type?: string; toolName?: string; output?: unknown };

/** The value of a tool result's output (AI SDK `{ type: 'json', value }`, or the raw value). */
function outputValue(output: unknown): unknown {
  if (output && typeof output === 'object' && 'type' in output && 'value' in output) return (output as { value: unknown }).value;
  return output;
}

/** Plugins this chat has loaded, from its messages. */
export function loadedPlugins(messages: readonly ModelMessage[]): Set<string> {
  const out = new Set<string>();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content as Part[]) {
      if (part.type === 'tool-call' && part.toolName && part.toolName !== USE_TOOL) out.add(pluginOfTool(part.toolName));
      if (part.type === 'tool-result' && part.toolName === USE_TOOL) {
        const value = outputValue(part.output) as { loaded?: { id?: unknown; error?: unknown }[] } | undefined;
        for (const l of value?.loaded ?? []) if (typeof l.id === 'string' && !l.error) out.add(l.id);
      }
    }
  }
  return out;
}

/** The tool names to offer: every tool of an always-loaded plugin, plus those of plugins this chat loaded. */
export function activeToolNames(toolNames: readonly string[], always: ReadonlySet<string>, messages: readonly ModelMessage[]): string[] {
  const loaded = loadedPlugins(messages);
  return toolNames.filter((name) => {
    const id = pluginOfTool(name);
    return always.has(id) || loaded.has(id);
  });
}
