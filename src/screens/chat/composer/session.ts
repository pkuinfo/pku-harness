/**
 * The composer's view of the active session (docs/AGENT-HARNESS.md §2, §4.4–4.5), on top of the
 * sessions API.
 */
import { useSyncExternalStore } from 'react';

import { useChatSelector } from '@/core/agent/session/chat-store';
import { aiConfig, useAIConfig } from '@/core/agent/provider';
import { sessions, useActiveSessionId, useSessionMeta } from '@/core/agent/session/sessions';

export { useActiveSessionId };

/** Streaming state of the active session. */
export function useSessionBusy(): boolean {
  return useSyncExternalStore(sessions.subscribe, () => sessions.get(sessions.activeId())?.status === 'streaming');
}

/** Whether the active session has any messages (the context ring hides in an empty one). */
export function useSessionEmpty(): boolean {
  return useChatSelector((s) => s.messages.length === 0);
}

/** Provider + model the active session uses: its own, else the default (AI settings). */
export function useSessionModel(): { providerId: string; model: string } {
  const { config } = useAIConfig();
  const meta = useSessionMeta();
  return meta?.providerId && meta.model ? { providerId: meta.providerId, model: meta.model } : { providerId: config.providerId, model: config.model };
}

/**
 * Use this model for the active session from the next request, and as the default for new
 * sessions (§4.5).
 */
export async function applyModel(providerId: string, model: string) {
  sessions.setModel(sessions.activeId(), providerId, model);
  await aiConfig.save(providerId, { model }, { activate: true });
}
