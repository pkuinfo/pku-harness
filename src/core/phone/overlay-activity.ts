import type { ChatState } from '../agent/session/chat-store';

export type OverlayActivity = { phase: 'waiting' | 'thinking' | 'working' | 'attention'; toolId?: string };

/** Only current, matching phone work contributes status. No prompt, arguments, or output leave JS. */
export function phoneActivity(states: readonly ChatState[], sessionId: string): OverlayActivity {
  for (const state of states) {
    if (state.status !== 'streaming' || !state.running) continue;
    const message = state.messages.find((item) => item.id === state.running && item.role === 'assistant');
    if (!message) continue;
    const tools = message.parts.filter((part) => part.type === 'tool');
    const belongs = tools.some((part) => part.toolId.startsWith('copilot.') && part.input && typeof part.input === 'object'
      && 'sessionId' in part.input && part.input.sessionId === sessionId);
    if (!belongs) continue;
    const running = tools.findLast((part) => part.status === 'running');
    if (running) return { phase: 'working', toolId: running.toolId };
    const latest = tools.at(-1);
    return latest?.status === 'error' ? { phase: 'attention', toolId: latest.toolId } : { phase: 'thinking' };
  }
  return { phase: 'waiting' };
}
