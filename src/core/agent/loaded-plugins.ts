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

/** Plugins this chat has loaded, from its messages: `plugins__use` results, and calls to their tools. */
export function loadedPlugins(messages: readonly ModelMessage[]): Set<string> {
  const { used, called } = scan(messages);
  return new Set([...used, ...[...called].map(pluginOfTool)]);
}

/** Plugins loaded explicitly (`plugins__use`), and the tools this chat has called. */
function scan(messages: readonly ModelMessage[]): { used: Set<string>; called: Set<string> } {
  const used = new Set<string>();
  const called = new Set<string>();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content as Part[]) {
      if (part.type === 'tool-call' && part.toolName && part.toolName !== USE_TOOL) called.add(part.toolName);
      if (part.type === 'tool-result' && part.toolName === USE_TOOL) {
        const value = outputValue(part.output) as { loaded?: { id?: unknown; error?: unknown }[] } | undefined;
        for (const l of value?.loaded ?? []) if (typeof l.id === 'string' && !l.error) used.add(l.id);
      }
    }
  }
  return { used, called };
}

/**
 * The tool names to offer: every tool of an always-loaded plugin, plus those of plugins this chat
 * loaded. An `onDemand` tool (even of a core plugin) waits for an explicit `plugins__use` of its
 * plugin, or stays once the chat has called it.
 */
export function activeToolNames(toolNames: readonly string[], always: ReadonlySet<string>, messages: readonly ModelMessage[], onDemand: ReadonlySet<string> = new Set()): string[] {
  const { used, called } = scan(messages);
  const loaded = new Set([...used, ...[...called].map(pluginOfTool)]);
  return toolNames.filter((name) => {
    const id = pluginOfTool(name);
    if (onDemand.has(name)) return used.has(id) || called.has(name);
    return always.has(id) || loaded.has(id);
  });
}
