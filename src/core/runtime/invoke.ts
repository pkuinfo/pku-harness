import { kv } from '@/core/store/kv';
import { t } from '@/i18n';

import { pluginName, toolTitle } from './localize';
import { pluginSettings } from './plugin-settings';
import { registry, type ToolEntry } from './registry';
import type { Actor, HostServices, TurnInfo } from './types';

export class ToolError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'disabled' | 'declined' | 'invalid_input' | 'failed',
  ) {
    super(message);
  }
}

type AskHandler = (entry: ToolEntry, input: unknown) => Promise<boolean>;

let askHandler: AskHandler | null = null;
export const services = {} as HostServices;

const writeListeners = new Set<(pluginId: string, toolId: string) => void>();

/** Called after a tool that changes state (effect other than 'read') succeeds; cached reads use it. */
export function onToolWrite(listener: (pluginId: string, toolId: string) => void) {
  writeListeners.add(listener);
  return () => void writeListeners.delete(listener);
}

/** The UI registers a handler that shows a prompt for tools whose effect is set to 'ask'. */
export function setAskHandler(handler: AskHandler | null) {
  askHandler = handler;
}

/** True when a tool's output is written by third parties (its own flag, or any remote plugin). */
export function isUntrusted(entry: ToolEntry): boolean {
  return !!entry.def.untrusted || !!registry.get(entry.pluginId)?.remote;
}

/**
 * Single entry point for running a tool. Screens, the agent and the scheduler all come
 * through here, so they share validation and per-plugin settings.
 *
 * `turn` (agent calls in a chat turn) is the turn's taint state, shared by its calls: an
 * untrusted tool marks it at the start of the call (conservative for calls running in parallel),
 * and each call sees a snapshot as `ctx.turn`.
 */
export async function invokeTool(
  id: string,
  rawInput: unknown,
  opts: { actor: Actor; signal?: AbortSignal; turn?: TurnInfo },
): Promise<unknown> {
  const entry = registry.tool(id);
  if (!entry) throw new ToolError(t('app.plugins.runtime.noTool', { id }), 'not_found');

  const why = registry.unavailable(entry.pluginId);
  if (why) throw new ToolError(why, 'disabled');
  const settings = pluginSettings.get(entry.pluginId);
  const plugin = registry.get(entry.pluginId);
  if (!settings.enabled) throw new ToolError(t('app.plugins.runtime.pluginOff', { name: plugin ? pluginName(plugin) : entry.pluginId }), 'disabled');

  if (entry.def.userOnly && opts.actor !== 'user') throw new ToolError(t('app.plugins.runtime.userOnly', { title: toolTitle(plugin, entry.name, entry.def.title) }), 'declined');

  const parsed = entry.def.input.safeParse(rawInput ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.message, 'invalid_input');

  const mode = settings.modes[entry.def.effect];
  const title = toolTitle(plugin, entry.name, entry.def.title);
  if (mode === 'off') throw new ToolError(t('app.plugins.runtime.toolBlocked', { title }), 'disabled');
  // A scheduled run has no one to ask (and may be headless): an `ask` tool is declined, never prompted.
  if (mode === 'ask' && opts.actor === 'scheduler') throw new ToolError(t('app.plugins.runtime.scheduledNoAsk', { title }), 'declined');
  // A user tapping a button has already expressed intent; only agent calls prompt.
  if (mode === 'ask' && opts.actor !== 'user') {
    const ok = askHandler ? await askHandler(entry, parsed.data) : false;
    if (!ok) throw new ToolError(t('app.plugins.runtime.declined', { title }), 'declined');
  }

  const turn = opts.turn ? { sessionId: opts.turn.sessionId, tainted: opts.turn.tainted, userAsked: opts.turn.userAsked } : undefined;
  if (opts.turn && isUntrusted(entry)) opts.turn.tainted = true;

  try {
    const out = await entry.def.execute(parsed.data, {
      pluginId: entry.pluginId,
      actor: opts.actor,
      turn,
      kv: kv(`plugin:${entry.pluginId}`),
      services,
      signal: opts.signal,
    });
    if (entry.def.effect !== 'read') writeListeners.forEach((l) => l(entry.pluginId, id));
    return out;
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw new ToolError(e instanceof Error ? e.message : String(e), 'failed');
  }
}
