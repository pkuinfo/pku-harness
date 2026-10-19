import { isStepCount, streamText } from 'ai';

import { gatherContext } from './context';
import { buildSystemPrompt } from './system-prompt';
import { chatStore, newId, type ChatMessage, type ChatPart } from './chat-store';
import { getModel } from './provider';
import { buildToolSet, fromModelName } from './tools';

let controller: AbortController | null = null;

const UI_TOOL = 'ui__render';

function appendPart(messageId: string, part: ChatPart) {
  chatStore.updateMessage(messageId, (m) => ({ ...m, parts: [...m.parts, part] }));
}

function appendText(messageId: string, kind: 'text' | 'reasoning', delta: string) {
  chatStore.updateMessage(messageId, (m) => {
    const last = m.parts[m.parts.length - 1];
    if (last && last.type === kind) {
      return { ...m, parts: [...m.parts.slice(0, -1), { ...last, text: last.text + delta }] };
    }
    return { ...m, parts: [...m.parts, { type: kind, text: delta }] };
  });
}

function patchTool(messageId: string, callId: string, patch: Partial<Extract<ChatPart, { type: 'tool' }>>) {
  chatStore.updateMessage(messageId, (m) => ({
    ...m,
    parts: m.parts.map((p) => (p.type === 'tool' && p.callId === callId ? { ...p, ...patch } : p)),
  }));
}

/** Send a user message and stream the agent's multi-step answer into the chat store. */
export async function sendMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed || chatStore.get().status === 'streaming') return;

  const userMsg: ChatMessage = { id: newId(), role: 'user', parts: [{ type: 'text', text: trimmed }], createdAt: Date.now() };
  const assistant: ChatMessage = { id: newId(), role: 'assistant', parts: [], createdAt: Date.now() };
  // Plugin request context (memory, …) travels with the user message in the model-visible,
  // logged history; the chat UI shows only what the user typed.
  const context = await gatherContext(trimmed);
  const content = context ? `<context>\n${context}\n</context>\n\n${trimmed}` : trimmed;
  const history = [...chatStore.get().history, { role: 'user' as const, content }];
  chatStore.set({
    messages: [...chatStore.get().messages, userMsg, assistant],
    history,
    status: 'streaming',
    error: undefined,
  });

  controller = new AbortController();
  const signal = controller.signal;
  try {
    const model = await getModel();
    const result = streamText({
      model,
      system: buildSystemPrompt(),
      messages: history,
      tools: buildToolSet(signal),
      stopWhen: isStepCount(10),
      abortSignal: signal,
      onEnd: ({ responseMessages }) => {
        chatStore.set({ history: [...history, ...responseMessages] });
      },
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          appendText(assistant.id, 'text', part.text);
          break;
        case 'reasoning-delta':
          appendText(assistant.id, 'reasoning', part.text);
          break;
        case 'tool-call':
          if (part.toolName === UI_TOOL) {
            appendPart(assistant.id, { type: 'ui', callId: part.toolCallId, spec: (part.input as { spec?: unknown })?.spec });
          } else {
            appendPart(assistant.id, {
              type: 'tool',
              callId: part.toolCallId,
              toolId: fromModelName(part.toolName),
              status: 'running',
              input: part.input,
            });
          }
          break;
        case 'tool-result': {
          const out = part.output as { error?: string } | undefined;
          patchTool(assistant.id, part.toolCallId, out && typeof out === 'object' && 'error' in out
            ? { status: 'error', error: String(out.error) }
            : { status: 'done', output: part.output });
          break;
        }
        case 'tool-error':
          patchTool(assistant.id, part.toolCallId, { status: 'error', error: String(part.error) });
          break;
        case 'error':
          throw part.error;
      }
    }
  } catch (e) {
    if (!signal.aborted) chatStore.set({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    controller = null;
    chatStore.set({ status: 'idle' });
  }
}

export function stopGeneration() {
  controller?.abort();
}

/** The last turn was cut off (app reload, crash, lost network) before any reply arrived. */
export function interruptedTurn(state = chatStore.get()): string | null {
  if (state.status === 'streaming') return null;
  const msgs = state.messages;
  const last = msgs.at(-1);
  const user = last?.role === 'assistant' && last.parts.length === 0 ? msgs.at(-2) : last;
  if (user?.role !== 'user' || (last?.role === 'assistant' && last.parts.length > 0)) return null;
  return user.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
}

/** Drop the cut-off turn (UI and model history) and send the same message again. */
export async function retryLast() {
  const text = interruptedTurn();
  if (!text) return;
  const s = chatStore.get();
  const msgs = [...s.messages];
  if (msgs.at(-1)?.role === 'assistant') msgs.pop();
  msgs.pop();
  const history = [...s.history];
  if (history.at(-1)?.role === 'user') history.pop();
  chatStore.set({ messages: msgs, history, error: undefined });
  await sendMessage(text);
}
