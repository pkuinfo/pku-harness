/**
 * Slash commands (docs/AGENT-HARNESS.md §3): built-ins + plugin `contributes.commands`. Commands
 * run locally and never reach the model, except prompt commands, which send their expanded text
 * as a normal user message. Pure pieces live in parse.ts / rank.ts / merge.ts / format.ts.
 */
import { useSyncExternalStore } from 'react';

import { sendMessage } from '@/core/agent/run';
import { sessions } from '@/core/agent/session/sessions';
import { services } from '@/core/runtime/invoke';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';

import { builtinCommands } from './builtins';
import { mergeCommands, type LocalRunner } from './merge';
import { parseCommandLine } from './parse';
import type { Command, CommandContext } from './types';

export type { Command, CommandContext, CommandResult } from './types';
export { menuQuery } from './parse';
export { rankCommands } from './rank';

/** Menu group order and headers. */
export const COMMAND_GROUPS: { id: Command['group']; title: string }[] = [
  { id: 'session', title: '会话' },
  { id: 'context', title: '上下文' },
  { id: 'app', title: '应用' },
  { id: 'plugin', title: '插件' },
];

const runLocal: LocalRunner = async (entry, input, ctx) => {
  const def = entry.def;
  if (!('run' in def)) return;
  const out = await def.run(input, { services, navigate: ctx.navigate });
  return typeof out === 'string' ? out : undefined;
};

let cache: { version: number; settings: unknown; commands: Command[] } | null = null;
const builtins = builtinCommands(() => listCommands());

/** All commands (built-ins + enabled, available plugins), for the menu. Stable between changes. */
export function listCommands(): Command[] {
  const version = registry.version();
  const settings = pluginSettings.snapshot();
  if (cache && cache.version === version && cache.settings === settings) return cache.commands;
  const entries = registry
    .commands()
    .filter((e) => pluginSettings.get(e.pluginId).enabled && !registry.unavailable(e.pluginId))
    .map((e) => ({ ...e, icon: registry.get(e.pluginId)?.icon }));
  const commands = mergeCommands(builtins, entries, runLocal);
  cache = { version, settings, commands };
  return commands;
}

function subscribe(listener: () => void) {
  const a = registry.subscribe(listener);
  const b = pluginSettings.subscribe(listener);
  return () => {
    a();
    b();
  };
}

/** Re-renders when plugins (and so their commands) change. */
export function useCommands(): Command[] {
  return useSyncExternalStore(subscribe, listCommands);
}

/** Parse a draft: the command it starts with, or null (unknown /xyz = plain text). */
export function parseCommand(draft: string): { command: Command; input: string } | null {
  return parseCommandLine(draft, listCommands());
}

function isStreaming(sessionId: string): boolean {
  return sessions.get(sessionId)?.status === 'streaming';
}

/**
 * Run a draft if it is a command. Returns true when handled (the composer clears the draft);
 * a prompt command sends its text through sendMessage itself.
 */
export async function executeCommandLine(draft: string, ctx: CommandContext): Promise<boolean> {
  const parsed = parseCommand(draft);
  if (!parsed) return false;
  const { command, input } = parsed;
  const label = `/${command.name}`;
  const notice = (text: string, tone: 'info' | 'success' | 'warn' | 'error' = 'info') =>
    sessions.notice(text, tone, { command: label, sessionId: ctx.sessionId });

  if (command.idleOnly && isStreaming(ctx.sessionId)) {
    notice('回复结束后再试', 'warn');
    return true;
  }

  // The composer clears the draft once we return true; a draft a command sets (e.g. /rename
  // without a title) is applied after that.
  let pendingDraft: string | null = null;
  const local: CommandContext = { ...ctx, setDraft: (text) => void (pendingDraft = text) };
  const flushDraft = () => {
    if (pendingDraft !== null) {
      const text = pendingDraft;
      setTimeout(() => ctx.setDraft(text), 0);
    }
  };

  try {
    const result = await command.run(input, local);
    if (result.kind === 'prompt') {
      const text = result.text.trim();
      if (!text) return true;
      // While a reply streams, a prompt waits in the queue like any typed message (§4.4).
      if (isStreaming(ctx.sessionId)) sessions.enqueue({ text, attachments: [] });
      else void sendMessage(text);
    } else if (result.notice) {
      notice(result.notice, result.tone ?? 'info');
    }
  } catch (e) {
    notice(`${label} 失败：${e instanceof Error ? e.message : String(e)}`, 'error');
  }
  flushDraft();
  return true;
}
