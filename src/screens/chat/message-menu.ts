import { useSyncExternalStore } from 'react';

/**
 * Which user message has its 编辑 / 复制 row open (one at a time). Any touch on the chat screen
 * outside that row closes it, like a native context menu; so do scrolling and sending.
 *
 * Touch events bubble child-first: the row marks its own touches (`keep`) before the screen's
 * `onTouchStart` calls `dismiss`, so tapping 编辑 / 复制 still reaches the button.
 */
let open: string | null = null;
let kept = false;
const listeners = new Set<() => void>();

function set(next: string | null) {
  if (next === open) return;
  open = next;
  listeners.forEach((l) => l());
}

export const messageMenu = {
  get: () => open,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  open: (id: string) => set(id),
  close: () => set(null),
  /** The current touch started inside the open row: the next `dismiss` leaves it open. */
  keep() {
    kept = true;
  },
  /** A touch anywhere on the screen: close the row unless the touch began inside it. */
  dismiss() {
    if (kept) kept = false;
    else set(null);
  },
};

/** This message's row is the open one. */
export const useMessageMenuOpen = (id: string) => useSyncExternalStore(messageMenu.subscribe, () => messageMenu.get() === id);
