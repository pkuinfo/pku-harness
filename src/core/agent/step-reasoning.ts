/**
 * How hard the model thinks on each step. A provider lists the levels its API takes
 * (`ProviderDef.efforts`; DeepSeek: low | high | max, default high). The user picks one in the
 * model picker, or Auto: planning a task keeps the provider default, while the next tap of a
 * Copilot run already under way does not need it (on a phone every step's thinking is time the
 * user watches). So under Auto a step that follows only Copilot screen operations uses the
 * lowest level, and every other step (the turn's first, anything after another plugin's tools
 * or a failure) keeps the default.
 */
import type { ModelMessage } from 'ai';

import type { ReasoningEffort } from '@pku-harness/sdk';

import { pluginOfTool } from './loaded-plugins';
import type { EffortChoice } from './provider';

/** Copilot calls that start, stop or widen a run: worth full thought, not a quick next tap. */
const DELIBERATE = new Set(['copilot__start', 'copilot__requestApp', 'copilot__handoff', 'copilot__end']);

type Part = { type?: string; toolName?: string; output?: unknown };

const failed = (output: unknown) =>
  !!output && typeof output === 'object' && 'type' in output && /error|denied/.test(String((output as { type: unknown }).type));

export function stepReasoning(efforts: readonly ReasoningEffort[] | undefined, choice: EffortChoice | undefined, messages: readonly ModelMessage[]): ReasoningEffort | undefined {
  if (!efforts?.length) return undefined;
  if (choice && choice !== 'auto') return efforts.includes(choice) ? choice : undefined;
  const last = messages.findLastIndex((m) => m.role === 'assistant');
  // The turn's first step (the user's message is newest) plans the task.
  if (last < 0 || messages.slice(last).some((m) => m.role === 'user')) return undefined;
  const calls = (Array.isArray(messages[last].content) ? (messages[last].content as Part[]) : []).filter((p) => p.type === 'tool-call');
  if (!calls.length) return undefined;
  if (!calls.every((p) => p.toolName && pluginOfTool(p.toolName) === 'copilot' && !DELIBERATE.has(p.toolName))) return undefined;
  // A failed operation needs a rethink.
  const results = messages.slice(last + 1).flatMap((m) => (m.role === 'tool' && Array.isArray(m.content) ? (m.content as Part[]) : []));
  if (results.some((p) => p.type === 'tool-result' && failed(p.output))) return undefined;
  return efforts[0];
}
