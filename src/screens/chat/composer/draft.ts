/**
 * The composer's draft (docs/AGENT-HARNESS.md §4.6): text + attachments, per session, kept in
 * the session record through `sessions.draft/setDraft` (so it survives restarts with the
 * session). Keystrokes stay local and are written back debounced; the draft is reloaded when
 * the session changes, when it finishes loading, and when something outside the composer
 * replaces it (`sessions.draftRevision`: 编辑 a sent message, cancel edit).
 *
 * Other code fills the composer through `composerDraft.put(...)` (or `sessions.startEdit`).
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { flushSessions, type AttachmentPart } from '@/core/agent/session/chat-store';
import { sessions, type Draft } from '@/core/agent/session/sessions';

type State = Draft & { sessionId: string | null };

const SAVE_MS = 300;

let state: State = { sessionId: null, text: '', attachments: [] };
let seenRevision = -1;
let seenLoaded = false;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** Bumped when the draft is replaced from outside typing, so the composer can focus. */
let revision = 0;

const emit = () => listeners.forEach((l) => l());

function write() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!state.sessionId) return;
  const draft = { text: state.text, attachments: state.attachments };
  sessions.setDraft(draft.text || draft.attachments.length ? draft : undefined, state.sessionId);
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(write, SAVE_MS);
}

AppState.addEventListener('change', (s) => {
  if (s !== 'active' && timer) {
    write();
    void flushSessions();
  }
});

function load(sessionId: string, keepTyped: boolean, focus = false) {
  const saved = sessions.draft(sessionId);
  const typed = keepTyped && state.sessionId === sessionId && (state.text || state.attachments.length);
  if (typed) schedule();
  else state = { sessionId, text: saved?.text ?? '', attachments: saved?.attachments ?? [] };
  if (focus) revision++;
  emit();
}

export const composerDraft = {
  get: (): State => state,
  revision: () => revision,
  /**
   * Bring the draft in line with the session: called by the composer whenever the active id,
   * its loaded state or its draft revision changes.
   */
  sync(sessionId: string, loaded: boolean, draftRevision: number) {
    if (state.sessionId !== sessionId) {
      if (timer) write();
      state = { sessionId, text: '', attachments: [] };
      seenRevision = draftRevision;
      seenLoaded = loaded;
      load(sessionId, false);
      return;
    }
    if (draftRevision !== seenRevision) {
      // Replaced from outside (编辑 / cancel edit): that version wins over local typing.
      seenRevision = draftRevision;
      seenLoaded = loaded;
      if (timer) clearTimeout(timer);
      timer = null;
      load(sessionId, false, true);
    } else if (loaded && !seenLoaded) {
      // The session record arrived after the composer mounted; keep anything typed meanwhile.
      seenLoaded = true;
      load(sessionId, true);
    }
  },
  setText(text: string) {
    state = { ...state, text };
    schedule();
    emit();
  },
  setAttachments(attachments: AttachmentPart[]) {
    state = { ...state, attachments };
    schedule();
    emit();
  },
  /** Replace the whole draft from outside typing (commands, pulling back a queued message). */
  put(draft: Partial<Draft>) {
    state = { ...state, text: draft.text ?? '', attachments: draft.attachments ?? [] };
    revision++;
    write();
    emit();
  },
  /** After send: gone at once (no debounce window to resurrect it in). */
  clear() {
    state = { ...state, text: '', attachments: [] };
    write();
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useDraft(): State {
  return useSyncExternalStore(composerDraft.subscribe, composerDraft.get);
}

export function useComposerRevision(): number {
  return useSyncExternalStore(composerDraft.subscribe, composerDraft.revision);
}
