import type { ModelMessage } from 'ai';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { kv } from '@/core/store/kv';

export type ToolStatus = 'running' | 'done' | 'error';

export type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | {
      type: 'tool';
      callId: string;
      toolId: string;
      status: ToolStatus;
      input?: unknown;
      output?: unknown;
      error?: string;
    }
  | { type: 'ui'; callId: string; spec: unknown; submitted?: boolean };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: ChatPart[];
  createdAt: number;
};

export type ChatState = {
  messages: ChatMessage[];
  /** Exact model-visible history (AI SDK messages), kept separately from the UI view. */
  history: ModelMessage[];
  status: 'idle' | 'streaming';
  error?: string;
};

const store = kv('chat');
let state: ChatState = { messages: [], history: [], status: 'idle' };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Streaming appends a delta per token; re-rendering the conversation for each one saturated the
 * JS thread (taps and scrolling stalled mid-reply). State changes at once, but subscribers hear
 * about it at most every NOTIFY_MS (leading + trailing), which still reads as live typing.
 */
const NOTIFY_MS = 50;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let lastNotify = 0;

function notify() {
  if (notifyTimer) return;
  const wait = NOTIFY_MS - (Date.now() - lastNotify);
  const run = () => {
    notifyTimer = null;
    lastNotify = Date.now();
    listeners.forEach((l) => l());
  };
  if (wait <= 0) run();
  else notifyTimer = setTimeout(run, wait);
}

/** Persist once the chat has been quiet for SAVE_MS (never mid-stream: it serialises everything). */
const SAVE_MS = 400;
let lastChange = 0;

function save() {
  // One timer per quiet period, not a clear + set per token (each is a native timer call).
  const wait = SAVE_MS - (Date.now() - lastChange);
  if (wait > 0) {
    saveTimer = setTimeout(save, wait);
    return;
  }
  saveTimer = null;
  const { messages, history } = state;
  store.set('current', { messages, history }).catch(() => {});
}

function emit() {
  notify();
  lastChange = Date.now();
  saveTimer ??= setTimeout(save, SAVE_MS);
}

export const newId = () => Crypto.randomUUID();

export const chatStore = {
  get: () => state,
  set(patch: Partial<ChatState>) {
    state = { ...state, ...patch };
    emit();
  },
  /** Immutable update of one message. */
  updateMessage(id: string, fn: (m: ChatMessage) => ChatMessage) {
    state = { ...state, messages: state.messages.map((m) => (m.id === id ? fn(m) : m)) };
    emit();
  },
  async load() {
    const saved = await store.get<Pick<ChatState, 'messages' | 'history'>>('current');
    if (saved) state = { ...state, ...saved, status: 'idle' };
    listeners.forEach((l) => l());
  },
  clear() {
    state = { messages: [], history: [], status: 'idle' };
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useChat() {
  return useSyncExternalStore(chatStore.subscribe, chatStore.get);
}

/**
 * One value derived from the chat (a primitive or a stable reference): the component re-renders
 * only when it changes, not on every streamed token.
 */
export function useChatSelector<T>(select: (s: ChatState) => T): T {
  return useSyncExternalStore(chatStore.subscribe, () => select(state));
}
