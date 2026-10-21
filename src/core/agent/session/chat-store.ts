import type { ModelMessage } from 'ai';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { getDb } from '@/core/store/db';
import { kv } from '@/core/store/kv';
import { t } from '@/i18n';

import {
  countMessages,
  fallbackTitle,
  fromRow,
  legacySession,
  markInterrupted,
  previewOf,
  toRow,
  type PersistedMeta,
  type SessionRow,
} from './session-utils';
import type { QueuedMessage, SessionMeta } from './sessions';

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
  | { type: 'ui'; callId: string; spec: unknown; submitted?: boolean }
  /** A file the user attached (docs/AGENT-HARNESS.md §4.2). Pasted long text is a 'text' attachment. */
  | AttachmentPart
  /** UI-only line from a command or the harness (never sent to the model). Lives in an 'event' message. */
  | { type: 'notice'; tone: 'info' | 'success' | 'warn' | 'error'; text: string; command?: string }
  /** Marker where history was compacted; the summary replaced older turns in the model's view only. */
  | { type: 'compaction'; summary: string; compactedMessages: number; tokensBefore: number; tokensAfter: number; auto: boolean };

export type AttachmentPart = {
  type: 'attachment';
  id: string;
  kind: 'image' | 'file' | 'text';
  name: string;
  mime: string;
  /** Bytes (files/images) or characters (text). */
  size: number;
  /** Local file:// URI (images, files) in the app's document directory. */
  uri?: string;
  /** Inline content for 'text' attachments (long pastes, small text files). */
  text?: string;
  width?: number;
  height?: number;
};

/** Per-turn facts the UI shows on demand (reply footer stats); filled when the turn ends. */
export type TurnMeta = {
  providerId?: string;
  model?: string;
  durationMs?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  steps?: number;
  /** The turn stopped early: 'stopped' by the user, 'error', or 'interrupted' (app killed). */
  ended?: 'stopped' | 'error' | 'interrupted';
};

export type ChatMessage = {
  id: string;
  /** 'event' = UI-only row (notices, compaction markers); excluded from the model's history. */
  role: 'user' | 'assistant' | 'event';
  parts: ChatPart[];
  createdAt: number;
  meta?: TurnMeta;
};

/** A composer draft (§4.6), per session. */
export type Draft = { text: string; attachments: AttachmentPart[] };

/** One session's live state. `useChat()` returns the active session's. */
export type ChatState = {
  messages: ChatMessage[];
  /** Exact model-visible history (AI SDK messages), kept separately from the UI view. */
  history: ModelMessage[];
  status: 'idle' | 'streaming';
  error?: string;
  draft?: Draft;
  /** Messages typed while a reply streams (§4.4). */
  queue?: QueuedMessage[];
  /** A stop or an error paused the queue until 继续发送. */
  queuePaused?: boolean;
  /** Assistant message being streamed (persisted so a killed turn is marked interrupted on load). */
  running?: string;
  /** User message being edited (编辑): the next send truncates the session from it (§2). */
  editing?: string;
  /** Bumped when the draft is replaced from outside the composer (编辑), so it reloads it. */
  draftRev?: number;
  /** Plugins whose tools the agent loaded in this session (`tools__load`, §5.1). */
  tools?: string[];
};

/** What one session persists in kv('session') under its id. */
type SessionRecord = Pick<ChatState, 'messages' | 'history' | 'draft' | 'queue' | 'queuePaused' | 'running' | 'editing' | 'tools'>;

const records = kv('session');
const EMPTY: ChatState = { messages: [], history: [], status: 'idle' };

export const newId = () => Crypto.randomUUID();

const data = new Map<string, ChatState>();
const metas = new Map<string, SessionMeta>();
let active = '';
let loaded = false;

const listeners = new Set<() => void>();

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

/** Switching sessions must not wait for the throttle. */
function notifyNow() {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = null;
  lastNotify = Date.now();
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------------------------
// Persistence: a session is saved once it has been quiet for SAVE_MS (never mid-stream: it
// serialises everything), and everything is flushed when the app goes to the background.

const SAVE_MS = 400;
const dirty = new Map<string, number>(); // session id → last change
const dirtyMeta = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Sessions with nothing in them aren't written (no clutter of empty 新对话 rows). */
const worthSaving = (id: string) => {
  const s = data.get(id);
  return !!s && (s.messages.length > 0 || !!s.draft?.text || !!s.draft?.attachments.length || !!s.queue?.length);
};

async function writeSession(id: string, withRecord: boolean) {
  const meta = metas.get(id);
  const s = data.get(id);
  if (!meta) return;
  const db = await getDb();
  // Not loaded this run = it came from the database, so its row is worth updating. A loaded
  // session that went back to empty (draft cleared, nothing sent) must not leave its stale row
  // and draft behind: drop them, so a cleared draft stays cleared after a restart.
  if (s && !worthSaving(id)) {
    await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
    await records.delete(id);
    return;
  }
  const r = toRow(meta);
  await db.runAsync(
    `INSERT INTO sessions (id, title, created_at, updated_at, pinned, title_source, preview, provider_id, model, message_count, unread)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at, pinned = excluded.pinned,
       title_source = excluded.title_source, preview = excluded.preview, provider_id = excluded.provider_id,
       model = excluded.model, message_count = excluded.message_count, unread = excluded.unread`,
    r.id, r.title, r.created_at, r.updated_at, r.pinned ?? 0, r.title_source ?? 'fallback', r.preview ?? '', r.provider_id, r.model, r.message_count ?? 0, r.unread ?? 0,
  );
  if (withRecord && s) {
    const { messages, history, draft, queue, queuePaused, running, editing, tools } = s;
    const record: SessionRecord = { messages, history, draft, queue, queuePaused, running, editing, tools };
    await records.set(id, record);
  }
}

function saveDue() {
  saveTimer = null;
  const now = Date.now();
  let next = Infinity;
  for (const [id, at] of dirty) {
    const wait = SAVE_MS - (now - at);
    if (wait > 0) {
      next = Math.min(next, wait);
      continue;
    }
    dirty.delete(id);
    dirtyMeta.delete(id);
    writeSession(id, true).catch((e) => console.warn('session save failed', e));
  }
  for (const id of dirtyMeta) {
    if (dirty.has(id)) continue;
    dirtyMeta.delete(id);
    writeSession(id, false).catch((e) => console.warn('session meta save failed', e));
  }
  if (next < Infinity) saveTimer = setTimeout(saveDue, next);
}

function schedule() {
  // One timer per quiet period, not a clear + set per token (each is a native timer call).
  saveTimer ??= setTimeout(saveDue, SAVE_MS);
}

function markDirty(id: string) {
  dirty.set(id, Date.now());
  schedule();
}

function markMetaDirty(id: string) {
  dirtyMeta.add(id);
  schedule();
}

/** Write every pending change now (app backgrounded; before a destructive step). */
export async function flushSessions() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const ids = new Set([...dirty.keys(), ...dirtyMeta]);
  const full = new Set(dirty.keys());
  dirty.clear();
  dirtyMeta.clear();
  await Promise.all([...ids].map((id) => writeSession(id, full.has(id)).catch((e) => console.warn('session flush failed', e))));
}

// ---------------------------------------------------------------------------------------------
// Session metadata derived from the conversation.

let listCache: SessionMeta[] | null = null;

function freshMeta(id: string, now = Date.now()): SessionMeta {
  return { id, title: null, titleSource: 'fallback', createdAt: now, updatedAt: now, pinned: false, preview: '', messageCount: 0, status: 'idle', unread: false };
}

function setMeta(id: string, patch: Partial<SessionMeta>, persist = true) {
  const cur = metas.get(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  if ((Object.keys(patch) as (keyof SessionMeta)[]).every((k) => cur[k] === next[k])) return;
  metas.set(id, next);
  listCache = null;
  if (persist) markMetaDirty(id);
  notify();
}

function deriveMeta(id: string, prev: ChatState | undefined, next: ChatState) {
  const meta = metas.get(id);
  if (!meta) return;
  const patch: Partial<SessionMeta> = {};
  if (prev?.status !== next.status) patch.status = next.status;
  if (!prev || prev.messages.length !== next.messages.length || prev.messages[0] !== next.messages[0]) {
    patch.preview = previewOf(next.messages);
    patch.messageCount = countMessages(next.messages);
    if (meta.titleSource === 'fallback') patch.title = fallbackTitle(next.messages);
  }
  if (Object.keys(patch).length) setMeta(id, patch);
}

// ---------------------------------------------------------------------------------------------
// Hooks the run loop installs (avoids an import cycle run.ts ↔ sessions.ts).

type RunHooks = { stop: (sessionId: string) => void; kick: (sessionId: string) => void };
let runHooks: RunHooks = { stop: () => {}, kick: () => {} };
export function installRunHooks(h: RunHooks) {
  runHooks = h;
}
export const runHook = {
  stop: (id: string) => runHooks.stop(id),
  kick: (id: string) => runHooks.kick(id),
};

// ---------------------------------------------------------------------------------------------

async function ensure(id: string): Promise<ChatState> {
  const have = data.get(id);
  if (have) return have;
  const saved = await records.get<SessionRecord>(id);
  // Another call may have loaded it meanwhile.
  const again = data.get(id);
  if (again) return again;
  let s: ChatState = { ...EMPTY };
  if (saved) {
    const { messages } = markInterrupted(saved.messages ?? [], saved.running, t('chat.reply.cutOff'));
    s = {
      messages,
      history: saved.history ?? [],
      status: 'idle',
      draft: saved.draft,
      queue: saved.queue ?? [],
      queuePaused: saved.queuePaused,
      editing: saved.editing && messages.some((m) => m.id === saved.editing) ? saved.editing : undefined,
      tools: saved.tools,
    };
    // A queue that was waiting on a reply the app never finished stays paused (nothing sends by itself).
    if (saved.running && s.queue?.length) s.queuePaused = true;
    if (saved.running) markDirty(id);
  }
  data.set(id, s);
  if (!metas.has(id)) metas.set(id, freshMeta(id));
  return s;
}

/** Drop an empty session from memory (and disk) when the user leaves it. */
function forgetIfEmpty(id: string) {
  if (!id || worthSaving(id) || data.get(id)?.status === 'streaming') return;
  data.delete(id);
  metas.delete(id);
  dirty.delete(id);
  dirtyMeta.delete(id);
  listCache = null;
  getDb()
    .then((db) => db.runAsync('DELETE FROM sessions WHERE id = ?', id))
    .then(() => records.delete(id))
    .catch(() => {});
}

let appStateSub: { remove(): void } | null = null;

export const sessionStore = {
  /** Load the sessions list and open the most recent one (app start). Migrates the v1 chat. */
  async load() {
    const db = await getDb();
    let rows = await db.getAllAsync<SessionRow>('SELECT * FROM sessions ORDER BY updated_at DESC');
    const legacyKv = kv('chat');
    const legacy = await legacyKv.get<{ messages?: ChatMessage[]; history?: ModelMessage[] }>('current');
    if (legacy !== undefined) {
      const moved = rows.length === 0 ? legacySession(legacy, newId()) : null;
      if (moved) {
        const meta: SessionMeta = { ...moved.meta, status: 'idle' };
        metas.set(meta.id, meta);
        data.set(meta.id, { ...moved.record, status: 'idle', queue: [] });
        await writeSession(meta.id, true);
        rows = await db.getAllAsync<SessionRow>('SELECT * FROM sessions ORDER BY updated_at DESC');
      }
      await legacyKv.delete('current');
    }
    for (const r of rows) {
      const m: PersistedMeta = fromRow(r);
      metas.set(m.id, { ...metas.get(m.id), ...m, status: data.get(m.id)?.status ?? 'idle' });
    }
    listCache = null;
    const latest = rows[0]?.id;
    if (latest) {
      await ensure(latest);
      active = latest;
    } else {
      active = newId();
      metas.set(active, freshMeta(active));
      data.set(active, { ...EMPTY, queue: [] });
    }
    loaded = true;
    appStateSub ??= AppState.addEventListener('change', (s) => {
      if (s !== 'active') void flushSessions();
    });
    notifyNow();
  },
  isLoaded: () => loaded,
  activeId: () => active,
  /** A loaded session's state (undefined if it was never opened this run). */
  get: (id: string): ChatState | undefined => data.get(id),
  ensure,
  meta: (id: string) => metas.get(id),
  setMeta,
  /** Bump the session in the list (a new turn, a finished reply). */
  touch(id: string) {
    setMeta(id, { updatedAt: Date.now() });
  },
  /** All sessions worth listing, most recent first; stable reference between changes. */
  list(): SessionMeta[] {
    listCache ??= [...metas.values()].filter((m) => m.messageCount > 0 || m.status === 'streaming').sort((a, b) => b.updatedAt - a.updatedAt);
    return listCache;
  },
  /** Patch one session's state (by id: a reply keeps streaming into its own session). */
  patch(id: string, patch: Partial<ChatState>) {
    const prev = data.get(id);
    if (!prev) return;
    const next = { ...prev, ...patch };
    data.set(id, next);
    deriveMeta(id, prev, next);
    markDirty(id);
    notify();
  },
  /** Immutable update of one message in a session. */
  updateMessage(id: string, messageId: string, fn: (m: ChatMessage) => ChatMessage) {
    const prev = data.get(id);
    if (!prev) return;
    data.set(id, { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? fn(m) : m)) });
    markDirty(id);
    notify();
  },
  /** New empty session, made active; reuses the active one while it is still empty. */
  create(): string {
    const cur = data.get(active);
    if (cur && cur.messages.length === 0 && cur.status === 'idle') return active;
    const prev = active;
    active = newId();
    metas.set(active, freshMeta(active));
    data.set(active, { ...EMPTY, queue: [] });
    listCache = null;
    forgetIfEmpty(prev);
    notifyNow();
    return active;
  },
  async open(id: string) {
    if (!metas.has(id)) return;
    await ensure(id);
    const prev = active;
    active = id;
    if (metas.get(id)?.unread) setMeta(id, { unread: false });
    if (prev !== id) forgetIfEmpty(prev);
    notifyNow();
  },
  async remove(id: string) {
    runHook.stop(id);
    const wasActive = id === active;
    data.delete(id);
    metas.delete(id);
    dirty.delete(id);
    dirtyMeta.delete(id);
    listCache = null;
    const db = await getDb();
    await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
    await records.delete(id);
    if (wasActive) {
      const next = sessionStore.list()[0]?.id;
      if (next) {
        await ensure(next);
        active = next;
      } else {
        active = newId();
        metas.set(active, freshMeta(active));
        data.set(active, { ...EMPTY, queue: [] });
      }
    }
    notifyNow();
  },
  /** Forget everything in memory (data reset). The database is cleared by the caller. */
  reset() {
    for (const id of data.keys()) runHook.stop(id);
    data.clear();
    metas.clear();
    dirty.clear();
    dirtyMeta.clear();
    listCache = null;
    active = newId();
    metas.set(active, freshMeta(active));
    data.set(active, { ...EMPTY, queue: [] });
    notifyNow();
  },
  /** Tell subscribers something outside the store changed (e.g. a UI request). */
  ping: () => notifyNow(),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

const activeState = () => data.get(active) ?? EMPTY;

/**
 * The ACTIVE session's conversation (back-compat API for screens). The run loop writes by
 * session id through `sessionStore`, never through these.
 */
export const chatStore = {
  get: activeState,
  set(patch: Partial<ChatState>) {
    if (!data.has(active)) data.set(active, { ...EMPTY, queue: [] });
    if (!metas.has(active)) metas.set(active, freshMeta(active));
    sessionStore.patch(active, patch);
  },
  /** Immutable update of one message. */
  updateMessage(id: string, fn: (m: ChatMessage) => ChatMessage) {
    sessionStore.updateMessage(active, id, fn);
  },
  load: () => sessionStore.load(),
  /** Start over: a new empty session (the old one stays in the list). Used by data reset too. */
  clear() {
    sessionStore.reset();
  },
  subscribe: sessionStore.subscribe,
};

export function useChat() {
  return useSyncExternalStore(chatStore.subscribe, chatStore.get);
}

/**
 * One value derived from the chat (a primitive or a stable reference): the component re-renders
 * only when it changes, not on every streamed token.
 */
export function useChatSelector<T>(select: (s: ChatState) => T): T {
  return useSyncExternalStore(chatStore.subscribe, () => select(activeState()));
}
