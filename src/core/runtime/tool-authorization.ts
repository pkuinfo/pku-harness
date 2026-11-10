import type { Actor, ToolAssessment, ToolEffect } from '@pku-harness/sdk';
import { parseToolAssessment } from './tool-assessment';

type PermissionState = { enabled: boolean; modes: Record<ToolEffect, 'auto' | 'ask' | 'off'> };
type Denial = 'disabled' | 'blocked' | 'scheduledWrite' | 'scheduledAsk' | 'declined';
export class ToolPermissionDenied extends Error {
  constructor(readonly reason: Denial) { super(reason); }
}

/** A user's answer to a prompt: Allow (true), the prompt's remember option ('always'), or Deny. */
export type ApprovalAnswer = boolean | 'always';

function needsApproval(state: PermissionState, base: ToolEffect, effect: ToolEffect, actor: Actor, grant = false): boolean {
  if (!state.enabled) throw new ToolPermissionDenied('disabled');
  const modes = [state.modes[base], state.modes[effect]];
  if (modes.includes('off')) throw new ToolPermissionDenied('blocked');
  if (actor === 'scheduler' && (base !== 'read' || effect !== 'read')) throw new ToolPermissionDenied('scheduledWrite');
  if (actor === 'scheduler' && (grant || modes.includes('ask'))) throw new ToolPermissionDenied('scheduledAsk');
  // A grant (new access for the agent) always waits for the user's tap, even when the mode is 'auto'.
  return actor !== 'user' && (grant || modes.includes('ask'));
}

/** Recheck immediately before dispatch, after any asynchronous classification or user decision. */
export function assertToolPermission(state: PermissionState, base: ToolEffect, effect: ToolEffect, actor: Actor, approved: boolean, grant = false): void {
  if (needsApproval(state, base, effect, actor, grant) && !approved) throw new ToolPermissionDenied('declined');
}

export async function authorizeTool(options: {
  base: ToolEffect;
  actor: Actor;
  signal?: AbortSignal;
  /** The tool grants the agent new access (`ToolDef.grant`): agents always ask. */
  grant?: boolean;
  state(): PermissionState;
  classify?(): Promise<unknown>;
  ask(effect: ToolEffect, assessment?: ToolAssessment): Promise<ApprovalAnswer>;
}) {
  const { base, actor, signal, state, grant = false } = options;
  signal?.throwIfAborted();
  needsApproval(state(), base, base, actor, grant); // Refuse disabled tools before reading external state.
  const result = parseToolAssessment(await options.classify?.(), base);
  signal?.throwIfAborted();
  let approved = actor === 'user';
  let answer: ApprovalAnswer = false;
  if (needsApproval(state(), base, result.effect, actor, grant)) {
    answer = await options.ask(result.effect, result.assessment);
    approved = answer !== false;
    signal?.throwIfAborted();
    if (!approved) throw new ToolPermissionDenied('declined');
  }
  assertToolPermission(state(), base, result.effect, actor, approved, grant);
  // How a grant prompt was answered; direct user calls had no prompt.
  const granted: 'once' | 'always' | undefined = grant && answer !== false ? answer === 'always' ? 'always' : 'once' : undefined;
  return { ...result, approved, grant: granted };
}
