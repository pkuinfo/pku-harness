import { expect, test } from 'bun:test';
import type { ChatPart, ChatState } from '../agent/session/chat-store';
import { phoneActivity } from './overlay-activity';

const tool = (id: string, sessionId: string, status: 'running' | 'done' | 'error' = 'running'): ChatPart => ({
  type: 'tool', callId: id, toolId: id, status, input: { sessionId, text: 'secret text must never appear' },
});
const chat = (parts: ChatPart[]): ChatState => ({
  status: 'streaming', running: 'reply', history: [], messages: [{ id: 'reply', role: 'assistant', parts, createdAt: 1 }],
});

test('shows the matching background chat operation without exposing its input', () => {
  expect(phoneActivity([chat([tool('copilot.type', 'other')]), chat([tool('copilot.submit', 'phone')])], 'phone'))
    .toEqual({ phase: 'working', toolId: 'copilot.submit' });
});

test('reports planning after dispatch and attention after failure without claiming completion', () => {
  expect(phoneActivity([chat([tool('copilot.tap', 'phone', 'done')])], 'phone')).toEqual({ phase: 'thinking' });
  expect(phoneActivity([chat([tool('copilot.tap', 'phone', 'error')])], 'phone')).toEqual({ phase: 'attention', toolId: 'copilot.tap' });
});

test('ignores previous turns, unrelated plugins, and completed runs', () => {
  const old = chat([tool('copilot.tap', 'phone')]);
  expect(phoneActivity([{ ...old, running: 'new-reply' }], 'phone')).toEqual({ phase: 'waiting' });
  expect(phoneActivity([{ ...old, status: 'idle' }], 'phone')).toEqual({ phase: 'waiting' });
  expect(phoneActivity([chat([tool('notes.write', 'phone')])], 'phone')).toEqual({ phase: 'waiting' });
});
