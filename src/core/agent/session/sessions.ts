/**
 * Sessions (docs/AGENT-HARNESS.md §2). The `sessions` object and its types are a contract other
 * modules code against: members may be added, never renamed or removed. State lives in
 * chat-store.ts (`sessionStore`); the run loop (run.ts) writes replies by session id.
 */
import type { ModelMessage } from 'ai';
import { useSyncExternalStore } from 'react';

import { newId, runHook, sessionStore, type AttachmentPart, type ChatMessage, type ChatPart, type Draft } from './chat-store';
import { attachmentsOf, textOf } from './session-utils';

export type SessionMeta = {
  id: string;
  /** null until the auto title arrives; UI falls back to the preview. */
  title: string | null;
  titleSource: 'fallback' | 'auto' | 'user';
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  /** First ~60 chars of the last user message, for the list. */
  preview: string;
  providerId?: string;
  model?: string;
  messageCount: number;
  status: 'idle' | 'streaming';
  /** A reply finished while the user was in another session. */
  unread: boolean;
};

export type QueuedMessage = { id: string; text: string; attachments: Extract<ChatPart, { type: 'attachment' }>[]; createdAt: number };

const EMPTY_QUEUE: QueuedMessage[] = [];
let renameRequests = 0;

/** The session holding a queued message (active first). */
function sessionOfQueued(queuedId: string): string | undefined {
  const active = sessionStore.activeId();
  if (sessionStore.get(active)?.queue?.some((q) => q.id === queuedId)) return active;
  return sessionStore.list().find((m) => sessionStore.get(m.id)?.queue?.some((q) => q.id === queuedId))?.id;
}

export const sessions = {
  list: (): SessionMeta[] => sessionStore.list(),
  activeId: (): string => sessionStore.activeId(),
  get: (id: string): SessionMeta | undefined => sessionStore.meta(id),
  /** New empty session, made active. Reuses the active one if it is still empty. */
  create: async (): Promise<string> => sessionStore.create(),
  open: async (id: string): Promise<void> => sessionStore.open(id),
  rename: async (id: string, title: string): Promise<void> => {
    const t = title.replace(/\s+/g, ' ').trim();
    if (!t) return;
    sessionStore.setMeta(id, { title: t, titleSource: 'user' });
  },
  /** Delete a session (stops its reply first). Deleting the active one opens the next most recent. */
  remove: async (id: string): Promise<void> => sessionStore.remove(id),
  pin: async (id: string, on: boolean): Promise<void> => {
    sessionStore.setMeta(id, { pinned: on });
  },
  /** Add a UI-only notice to a session (default: active) as an 'event' message. */
  notice: (text: string, tone: 'info' | 'success' | 'warn' | 'error' = 'info', opts: { command?: string; sessionId?: string } = {}) => {
    const id = opts.sessionId ?? sessionStore.activeId();
    const s = sessionStore.get(id);
    if (!s) return;
    const msg: ChatMessage = { id: newId(), role: 'event', parts: [{ type: 'notice', tone, text, command: opts.command }], createdAt: Date.now() };
    sessionStore.patch(id, { messages: [...s.messages, msg] });
  },
  /** Messages typed while a reply streams wait here and are sent in order (§4.4). */
  queue: (sessionId?: string): QueuedMessage[] => sessionStore.get(sessionId ?? sessionStore.activeId())?.queue ?? EMPTY_QUEUE,
  /**
   * Queue a message (default: active session). It is sent automatically when the current reply
   * finishes normally; if the session is idle and the queue isn't paused, it goes out now.
   */
  enqueue: (msg: Omit<QueuedMessage, 'id' | 'createdAt'>, sessionId?: string): void => {
    const id = sessionId ?? sessionStore.activeId();
    const s = sessionStore.get(id);
    if (!s) return;
    const item: QueuedMessage = { ...msg, id: newId(), createdAt: Date.now() };
    sessionStore.patch(id, { queue: [...(s.queue ?? []), item] });
    if (s.status === 'idle' && !s.queuePaused) runHook.kick(id);
  },
  /** Remove a queued message (✕ on its chip, or pulled back into the composer). */
  dequeue: (id: string): void => {
    const sid = sessionOfQueued(id);
    if (!sid) return;
    const s = sessionStore.get(sid)!;
    const queue = (s.queue ?? []).filter((q) => q.id !== id);
    sessionStore.patch(sid, { queue, queuePaused: queue.length ? s.queuePaused : false });
  },
  subscribe: (l: () => void) => sessionStore.subscribe(l),

  // --- Additions (stage 1, sessions agent) -----------------------------------------------

  /** The queue stopped after a user stop or an error (chips show 已暂停 + 继续发送). */
  queuePaused: (sessionId?: string): boolean => !!sessionStore.get(sessionId ?? sessionStore.activeId())?.queuePaused,
  /** 继续发送: unpause and send the next queued message if the session is idle. */
  resumeQueue: (sessionId?: string): void => {
    const id = sessionId ?? sessionStore.activeId();
    if (!sessionStore.get(id)) return;
    sessionStore.patch(id, { queuePaused: false });
    runHook.kick(id);
  },
  /** Per-session composer draft (§4.6). */
  draft: (sessionId?: string): Draft | undefined => sessionStore.get(sessionId ?? sessionStore.activeId())?.draft,
  setDraft: (draft: Draft | undefined, sessionId?: string): void => {
    const id = sessionId ?? sessionStore.activeId();
    if (!sessionStore.get(id)) return;
    const empty = !draft || (!draft.text && !draft.attachments.length);
    sessionStore.patch(id, { draft: empty ? undefined : draft });
  },
  /** Use this provider/model for the session from its next request (the model picker). */
  setModel: (sessionId: string, providerId: string, model: string): void => {
    sessionStore.setMeta(sessionId, { providerId, model });
  },
  /** Clear the unread flag (opening a session does this). */
  markRead: (sessionId: string): void => {
    sessionStore.setMeta(sessionId, { unread: false });
  },
  /**
   * 编辑 (long-press a user message): its text and attachments become the draft and the next
   * send (`sendMessage`) truncates the session from that message and sends the edit instead.
   */
  startEdit: (messageId: string, sessionId?: string): void => {
    const id = sessionId ?? sessionStore.activeId();
    const s = sessionStore.get(id);
    const m = s?.messages.find((x) => x.id === messageId && x.role === 'user');
    if (!s || !m) return;
    sessionStore.patch(id, { editing: messageId, draft: { text: textOf(m), attachments: attachmentsOf(m) }, draftRev: (s.draftRev ?? 0) + 1 });
  },
  /** ✕ on the 编辑消息 banner: back to a normal (empty) draft. */
  cancelEdit: (sessionId?: string): void => {
    const id = sessionId ?? sessionStore.activeId();
    const s = sessionStore.get(id);
    if (!s?.editing) return;
    sessionStore.patch(id, { editing: undefined, draft: undefined, draftRev: (s.draftRev ?? 0) + 1 });
  },
  editing: (sessionId?: string): string | undefined => sessionStore.get(sessionId ?? sessionStore.activeId())?.editing,
  /** Changes whenever the draft was replaced from outside the composer; reload it then. */
  draftRevision: (sessionId?: string): number => sessionStore.get(sessionId ?? sessionStore.activeId())?.draftRev ?? 0,
  /** One loaded session's UI messages and model history (compaction reads these by id). */
  data: (id: string): { messages: ChatMessage[]; history: ModelMessage[] } | undefined => {
    const s = sessionStore.get(id);
    return s ? { messages: s.messages, history: s.history } : undefined;
  },
  /** Replace one session's messages/history atomically (loads it first if needed). */
  update: async (id: string, fn: (d: { messages: ChatMessage[]; history: ModelMessage[] }) => { messages: ChatMessage[]; history: ModelMessage[] }): Promise<void> => {
    const s = sessionStore.get(id) ?? (sessionStore.meta(id) ? await sessionStore.ensure(id) : undefined);
    if (!s) return;
    const cur = sessionStore.get(id)!;
    const next = fn({ messages: cur.messages, history: cur.history });
    sessionStore.patch(id, { messages: next.messages, history: next.history });
  },
  /** `/rename` with no title: ask the chat header to start its inline rename. */
  requestRename: (): void => {
    renameRequests++;
    sessionStore.ping();
  },
  /** Whether any session other than the active one is streaming / unread (header badge). */
  othersBusy: (): boolean => sessionStore.list().some((m) => m.id !== sessionStore.activeId() && m.status === 'streaming'),
  othersUnread: (): boolean => sessionStore.list().some((m) => m.id !== sessionStore.activeId() && m.unread),
};

export type { AttachmentPart, Draft };

export function useSessions() {
  return useSyncExternalStore(sessions.subscribe, sessions.list);
}

/** The active session's id (re-renders on switch). */
export function useActiveSessionId() {
  return useSyncExternalStore(sessions.subscribe, sessions.activeId);
}

/** One session's metadata (default: active); stable between changes. */
export function useSessionMeta(id?: string): SessionMeta | undefined {
  return useSyncExternalStore(sessions.subscribe, () => sessions.get(id ?? sessions.activeId()));
}

/** The message being edited in the active session, if any. */
export function useEditing(): string | undefined {
  return useSyncExternalStore(sessions.subscribe, () => sessions.editing());
}

/** Bumps when `/rename` asks the header to start renaming. */
export function useRenameRequest(): number {
  return useSyncExternalStore(sessions.subscribe, () => renameRequests);
}

/** See `sessions.draftRevision`. */
export function useDraftRevision(): number {
  return useSyncExternalStore(sessions.subscribe, () => sessions.draftRevision());
}

/** The active session's queue and whether it is paused. */
export function useQueue(sessionId?: string) {
  const queue = useSyncExternalStore(sessions.subscribe, () => sessions.queue(sessionId));
  const paused = useSyncExternalStore(sessions.subscribe, () => sessions.queuePaused(sessionId));
  return { queue, paused };
}
