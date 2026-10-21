import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { sessionStore } from '@/core/agent/session/chat-store';
import { invokeTool, services } from '@/core/runtime/invoke';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import type { PluginDef } from '@/core/runtime/types';
import { resolveDynamic } from '@/core/runtime/types';

import { activeNames, LOAD_TOOL, MAX_LOAD, resolveLoad } from './tool-loading-core';

export { CORE_PLUGINS, LOAD_TOOL } from './tool-loading-core';

/** Model-facing tool names can't contain dots: `campus-card.getBalance` → `campus-card__getBalance`. */
export const toModelName = (id: string) => id.replace('.', '__');
export const fromModelName = (name: string) => name.replace('__', '.');

/** Enabled plugins this device can run that have tools, sorted by id (the catalog's order). */
export function toolPlugins(): PluginDef[] {
  return registry
    .list()
    .filter((p) => Object.keys(p.tools).length > 0 && pluginSettings.get(p.id).enabled && !registry.unavailable(p.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** `tools__load`: make plugins' tools available for the rest of the session (§5.1). */
function loadTool(sessionId: string | undefined) {
  return tool({
    description: '加载插件的工具。除 ui、memory、plugins 外，插件的工具要先加载才能调用；加载后在本会话中一直可用，下一步即可调用。一次可加载多个插件。',
    inputSchema: z.object({ plugins: z.array(z.string()).min(1).max(MAX_LOAD).describe('插件 id，见系统提示中的插件目录') }),
    execute: async ({ plugins }: { plugins: string[] }) => {
      const available = new Map(toolPlugins().map((p) => [p.id, p]));
      const already = sessionId ? (sessionStore.get(sessionId)?.tools ?? []) : [];
      const outcome = resolveLoad(plugins, new Set(available.keys()), already);
      if (sessionId && outcome.next.join() !== already.join()) sessionStore.patch(sessionId, { tools: outcome.next });
      return {
        loaded: outcome.loaded.map((id) => ({ plugin: id, tools: Object.keys(available.get(id)!.tools).map((n) => toModelName(`${id}.${n}`)) })),
        ...(outcome.unknown.length ? { unknown: outcome.unknown, hint: '这些插件没有安装、未启用或不能在本机运行' } : {}),
      };
    },
  });
}

/**
 * Every enabled plugin tool plus the loader; execution goes through `invokeTool`. What the model
 * is actually sent each step is narrowed by `activeToolNames` (core + loaded plugins).
 */
export function buildToolSet(signal?: AbortSignal, sessionId?: string): ToolSet {
  const set: ToolSet = { [LOAD_TOOL]: loadTool(sessionId) };
  // Sorted by id so the tool block is a stable, cacheable prefix (docs/AGENT-HARNESS.md §5.1).
  const entries = [...registry.tools()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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

/** The tool names a session's next step sends: the loader, core plugins and what it loaded. */
export function activeToolNames(set: ToolSet, sessionId: string): string[] {
  return activeNames(Object.keys(set), sessionStore.get(sessionId)?.tools ?? []);
}

/** Only the tools a session's next request sends (for estimates and the compaction request). */
export function activeToolSet(sessionId: string): ToolSet {
  const set = buildToolSet(undefined, sessionId);
  return Object.fromEntries(activeToolNames(set, sessionId).map((n) => [n, set[n]]));
}
