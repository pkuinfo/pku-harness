/**
 * How hard the model thinks on each step. DeepSeek thinks at `high` effort unless told otherwise
 * (api-docs.deepseek.com/guides/thinking_mode: `reasoning_effort` low | high | max). Planning a
 * task deserves that; the next tap of a Copilot run that is already under way does not, and on
 * a phone every step's thinking is time the user watches. So a step that follows only Copilot
 * screen operations thinks at `low`, and every other step (the first one of a turn, anything
 * after another plugin's tools or a failure) keeps the provider default.
 */
import type { ModelMessage } from 'ai';

import { pluginOfTool } from './loaded-plugins';

/** Providers whose API takes `reasoning_effort` (the AI SDK `reasoning` option maps to it). */
const EFFORT_PROVIDERS = new Set(['deepseek']);

/** Copilot calls that start, stop or widen a run: worth full thought, not a quick next tap. */
const DELIBERATE = new Set(['copilot__start', 'copilot__requestApp', 'copilot__handoff', 'copilot__end']);

type Part = { type?: string; toolName?: string; output?: unknown };

const failed = (output: unknown) =>
  !!output && typeof output === 'object' && 'type' in output && /error|denied/.test(String((output as { type: unknown }).type));

export function stepReasoning(providerId: string, messages: readonly ModelMessage[]): 'low' | undefined {
  if (!EFFORT_PROVIDERS.has(providerId)) return undefined;
  const last = messages.findLastIndex((m) => m.role === 'assistant');
  // The turn's first step (the user's message is newest) plans the task.
  if (last < 0 || messages.slice(last).some((m) => m.role === 'user')) return undefined;
  const calls = (Array.isArray(messages[last].content) ? (messages[last].content as Part[]) : []).filter((p) => p.type === 'tool-call');
  if (!calls.length) return undefined;
  if (!calls.every((p) => p.toolName && pluginOfTool(p.toolName) === 'copilot' && !DELIBERATE.has(p.toolName))) return undefined;
  // A failed operation needs a rethink.
  const results = messages.slice(last + 1).flatMap((m) => (m.role === 'tool' && Array.isArray(m.content) ? (m.content as Part[]) : []));
  if (results.some((p) => p.type === 'tool-result' && failed(p.output))) return undefined;
  return 'low';
}
