/**
 * Merge built-in commands with plugin contributions (docs/AGENT-HARNESS.md §3). Pure; see
 * merge.test.ts. Every plugin is equal: when a plugin command's name is taken by a built-in or
 * by another plugin, *each* colliding plugin command becomes `<plugin>:<name>`; nobody wins by
 * registration order.
 */
import type { CommandContribution } from '@pku-harness/sdk';

import { COMMAND_NAME, expandPrompt } from './parse';
import type { Command, CommandContext } from './types';

export type PluginCommandEntry = {
  pluginId: string;
  /** Key in `contributes.commands`. */
  name: string;
  def: CommandContribution;
  /** The plugin's icon, shown in the menu. */
  icon?: string;
};

/** Runs a plugin's local (`run`) command with host services; returns its notice text. */
export type LocalRunner = (entry: PluginCommandEntry, input: string, ctx: CommandContext) => Promise<string | void>;

export function mergeCommands(builtins: readonly Command[], entries: readonly PluginCommandEntry[], runLocal: LocalRunner): Command[] {
  const valid = entries.filter((e) => COMMAND_NAME.test(e.name) && e.def.description);
  const taken = new Set(builtins.map((c) => c.name));
  const count = new Map<string, number>();
  for (const e of valid) count.set(e.name, (count.get(e.name) ?? 0) + 1);

  const plugin = valid.map((e): Command => {
    const collides = taken.has(e.name) || (count.get(e.name) ?? 0) > 1;
    const def = e.def;
    return {
      name: collides ? `${e.pluginId}:${e.name}` : e.name,
      aliases: (def.aliases ?? []).map((a) => a.trim()).filter((a) => a && !/\s/.test(a)),
      description: def.description,
      argHint: def.argHint,
      group: 'plugin',
      icon: e.icon,
      pluginId: e.pluginId,
      run: async (input, ctx) => {
        if ('prompt' in def) return { kind: 'prompt', text: expandPrompt(def.prompt, input) };
        const notice = await runLocal(e, input, ctx);
        return { kind: 'done', notice: notice || undefined };
      },
    };
  });
  return [...builtins, ...plugin];
}
