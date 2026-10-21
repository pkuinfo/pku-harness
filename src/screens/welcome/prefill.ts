import { composerDraft } from '@/screens/chat/composer/draft';

const WAIT_MS = 4000;

/**
 * Put a suggested first question into the chat composer once it has attached to a session (the
 * chat tab mounts after onboarding). The user still taps send: nothing is sent on their behalf.
 */
export function prefillChat(text: string) {
  const ready = () => composerDraft.get().sessionId != null;
  if (ready()) {
    composerDraft.put({ text });
    return;
  }
  const off = composerDraft.subscribe(() => {
    if (!ready()) return;
    off();
    clearTimeout(timer);
    // Let the composer finish its own sync for the session first.
    requestAnimationFrame(() => composerDraft.put({ text }));
  });
  const timer = setTimeout(off, WAIT_MS);
}
