import { ownProvider } from '@/core/agent/provider';
import { cloudFor } from '@/core/cloud/bind';
import { scrubOutput, scrubShareLinks } from '@/core/cloud/secret-link';
import { kv } from '@/core/store/kv';
import { t } from '@/i18n';

import { pluginName, toolTitle } from './localize';
import { pluginSettings } from './plugin-settings';
import { registry, type ToolEntry } from './registry';
import { assertToolPermission, authorizeTool, ToolPermissionDenied, type ApprovalAnswer } from './tool-authorization';
import type { Actor, HostServices, TurnInfo, ToolAssessment } from './types';
import { nativeReason } from '@/utils/native-error';

export class ToolError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'disabled' | 'declined' | 'invalid_input' | 'failed',
  ) {
    super(message);
  }
}

type AskHandler = (entry: ToolEntry, input: unknown, signal?: AbortSignal, assessment?: ToolAssessment) => Promise<ApprovalAnswer>;

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
  // `serial` tools of one plugin queue behind each other, approval included (ToolDef.serial).
  if (entry?.def.serial) return serially(entry.pluginId, () => invokeNow(id, rawInput, opts));
  return invokeNow(id, rawInput, opts);
}

/** Tail of each plugin's queue of serial calls. */
const serialTails = new Map<string, Promise<unknown>>();

function serially<T>(pluginId: string, run: () => Promise<T>): Promise<T> {
  const tail = serialTails.get(pluginId) ?? Promise.resolve();
  const next = tail.then(run, run);
  const settled = next.catch(() => undefined);
  serialTails.set(pluginId, settled);
  void settled.then(() => {
    if (serialTails.get(pluginId) === settled) serialTails.delete(pluginId);
  });
  return next;
}

async function invokeNow(
  id: string,
  rawInput: unknown,
  opts: { actor: Actor; signal?: AbortSignal; turn?: TurnInfo },
): Promise<unknown> {
  const entry = registry.tool(id);
  if (!entry) throw new ToolError(t('app.plugins.runtime.noTool', { id }), 'not_found');

  const why = registry.unavailable(entry.pluginId);
  if (why) throw new ToolError(why, 'disabled');
  const plugin = registry.get(entry.pluginId);

  if (entry.def.userOnly && opts.actor !== 'user') throw new ToolError(t('app.plugins.runtime.userOnly', { title: toolTitle(plugin, entry.name, entry.def.title) }), 'declined');

  const parsed = entry.def.input.safeParse(rawInput ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.message, 'invalid_input');

  const title = toolTitle(plugin, entry.name, entry.def.title);
  const readPermissions = () => {
    // Resolution creates a new entry wrapper; compare the installed definition and id.
    const current = registry.tool(id);
    if (current?.id !== entry.id || current.def !== entry.def) throw new ToolError(t('app.plugins.runtime.noTool', { id }), 'not_found');
    const unavailable = registry.unavailable(entry.pluginId);
    if (unavailable) throw new ToolError(unavailable, 'disabled');
    return pluginSettings.get(entry.pluginId);
  };
  let effect = entry.def.effect;
  let grant: 'once' | 'always' | undefined;
  const isGrant = !!entry.def.grant;
  const alwaysAsk = !!entry.def.alwaysAsk;
  try {
    const authorization = await authorizeTool({
      base: entry.def.effect,
      actor: opts.actor,
      signal: opts.signal,
      grant: isGrant,
      alwaysAsk,
      state: readPermissions,
      classify: entry.def.resolveEffect ? () => entry.def.resolveEffect!(parsed.data, services) : undefined,
      ask: async (effective, assessment) => {
        const classified = effective === entry.def.effect ? entry : { ...entry, def: { ...entry.def, effect: effective } };
        return askHandler ? askHandler(classified, parsed.data, opts.signal, assessment) : false;
      },
    });
    effect = authorization.effect;
    grant = authorization.grant;
    opts.signal?.throwIfAborted();
    assertToolPermission(readPermissions(), entry.def.effect, effect, opts.actor, authorization.approved, isGrant || alwaysAsk);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    if (error instanceof ToolPermissionDenied) {
      switch (error.reason) {
        case 'disabled': throw new ToolError(t('app.plugins.runtime.pluginOff', { name: plugin ? pluginName(plugin) : entry.pluginId }), 'disabled');
        case 'blocked': throw new ToolError(t('app.plugins.runtime.toolBlocked', { title }), 'disabled');
        case 'scheduledWrite': throw new ToolError(t('app.plugins.runtime.scheduledReadOnly', { title }), 'declined');
        case 'scheduledAsk': throw new ToolError(t('app.plugins.runtime.scheduledNoAsk', { title }), 'declined');
        case 'declined': throw new ToolError(t('app.plugins.runtime.declined', { title }), 'declined');
      }
    }
    throw new ToolError(scrubShareLinks(nativeReason(error instanceof Error ? error.message : String(error))), 'failed');
  }

  const turn = opts.turn ? { sessionId: opts.turn.sessionId, tainted: opts.turn.tainted, userAsked: opts.turn.userAsked, acceptsImages: opts.turn.acceptsImages } : undefined;
  if (opts.turn && isUntrusted(entry)) opts.turn.tainted = true;

  try {
    const out = await entry.def.execute(parsed.data, {
      pluginId: entry.pluginId,
      effect,
      grant,
      actor: opts.actor,
      turn,
      kv: kv(`plugin:${entry.pluginId}`),
      services,
      // Bound to this plugin; a person tapping may be shown the consent sheet, the agent may not.
      cloud: cloudFor(entry.pluginId, { interactive: opts.actor === 'user' }),
      provider: (key) => ownProvider(entry.pluginId, key),
      signal: opts.signal,
    });
    if (entry.def.effect !== 'read' || effect !== 'read') writeListeners.forEach((l) => l(entry.pluginId, id));
    // Share links never reach the model or stored job results (docs/CLOUD.md §2.8); a screen
    // calling as the user may get its SecretLink objects back.
    return scrubOutput(out, { keepLinks: opts.actor === 'user' });
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw new ToolError(scrubShareLinks(nativeReason(e instanceof Error ? e.message : String(e))), 'failed');
  }
}
