import { z } from 'zod';

import { pluginSettings } from '@/core/runtime/plugin-settings';
import { effectOf, remotePlugins } from '@/core/runtime/remote';
import { registry } from '@/core/runtime/registry';
import { definePlugin, defineTool } from '@/core/runtime/types';

/**
 * Plugin management as tools. Listing is free; installing or removing a remote plugin asks the
 * user by default, and permissions themselves are only changed by the user in Settings.
 */
export const pluginsPlugin = definePlugin({
  id: 'plugins',
  name: '插件管理',
  description: '查看已安装的插件，安装或移除远程（MCP）插件。',
  version: '0.1.0',
  icon: 'puzzle',
  core: true,
  scopes: [],
  defaultModes: { write: 'ask' },
  tools: {
    list: defineTool({
      title: '查看插件',
      description: 'Installed plugins with their tools, whether they are enabled, and their per-effect modes.',
      input: z.object({}),
      effect: 'read',
      execute: async () =>
        registry.list().map((p) => {
          const s = pluginSettings.get(p.id);
          return {
            id: p.id,
            name: p.name,
            kind: p.core ? 'system' : p.remote ? 'remote' : 'builtin',
            enabled: s.enabled,
            modes: s.modes,
            tools: Object.entries(p.tools).map(([name, t]) => ({ id: `${p.id}.${name}`, title: t.title, effect: t.effect })),
          };
        }),
    }),
    installRemote: defineTool({
      title: '安装远程插件',
      description: 'Install a remote plugin from an MCP (Streamable HTTP) endpoint URL. Its tools become available after install.',
      input: z.object({
        url: z.string().url(),
        name: z.string().optional(),
        token: z.string().optional().describe('bearer token if the server requires one'),
      }),
      effect: 'write',
      execute: async (input) => {
        const m = await remotePlugins.install(input);
        return { id: m.id, name: m.name, tools: m.tools.map((t) => ({ name: t.name, effect: effectOf(t) })) };
      },
    }),
    uninstall: defineTool({
      title: '移除远程插件',
      description: 'Remove an installed remote plugin.',
      input: z.object({ id: z.string() }),
      effect: 'write',
      execute: async ({ id }) => {
        if (!remotePlugins.get(id)) throw new Error(`只能移除远程插件：${id}`);
        await remotePlugins.uninstall(id);
        return { removed: id };
      },
    }),
  },
});
