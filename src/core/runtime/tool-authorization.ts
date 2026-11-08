import type { Actor, ToolAssessment, ToolEffect } from '@pku-harness/sdk';
import { parseToolAssessment } from './tool-assessment';

type PermissionState = { enabled: boolean; modes: Record<ToolEffect, 'auto' | 'ask' | 'off'> };
type Denial = 'disabled' | 'blocked' | 'scheduledWrite' | 'scheduledAsk' | 'declined';
export class ToolPermissionDenied extends Error {
  constructor(readonly reason: Denial) { super(reason); }
}

function needsApproval(state: PermissionState, base: ToolEffect, effect: ToolEffect, actor: Actor): boolean {
  if (!state.enabled) throw new ToolPermissionDenied('disabled');
  const modes = [state.modes[base], state.modes[effect]];
  if (modes.includes('off')) throw new ToolPermissionDenied('blocked');
  if (actor === 'scheduler' && (base !== 'read' || effect !== 'read')) throw new ToolPermissionDenied('scheduledWrite');
  if (actor === 'scheduler' && modes.includes('ask')) throw new ToolPermissionDenied('scheduledAsk');
  return actor !== 'user' && modes.includes('ask');
}

/** Recheck immediately before dispatch, after any asynchronous classification or user decision. */
export function assertToolPermission(state: PermissionState, base: ToolEffect, effect: ToolEffect, actor: Actor, approved: boolean): void {
  if (needsApproval(state, base, effect, actor) && !approved) throw new ToolPermissionDenied('declined');
}

export async function authorizeTool(options: {
  base: ToolEffect;
  actor: Actor;
  signal?: AbortSignal;
  state(): PermissionState;
  classify?(): Promise<unknown>;
  ask(effect: ToolEffect, assessment?: ToolAssessment): Promise<boolean>;
}) {
  const { base, actor, signal, state } = options;
  signal?.throwIfAborted();
  needsApproval(state(), base, base, actor); // Refuse disabled tools before reading external state.
  const result = parseToolAssessment(await options.classify?.(), base);
  signal?.throwIfAborted();
  let approved = actor === 'user';
  if (needsApproval(state(), base, result.effect, actor)) {
    approved = await options.ask(result.effect, result.assessment);
    signal?.throwIfAborted();
    if (!approved) throw new ToolPermissionDenied('declined');
  }
  assertToolPermission(state(), base, result.effect, actor, approved);
  return { ...result, approved };
}
