import { createContext, useContext, useSyncExternalStore, type ComponentRef, type ReactNode, type RefObject } from 'react';
import type { View } from 'react-native';

/**
 * One floating element a tab screen can raise above its content (e.g. the chat's jump-to-latest
 * pill). The tabs layout renders it *outside* the blur target, like the tab bar, so it can use a
 * real BlurView of the content beneath — a BlurView inside its own target can't, and nesting a
 * second target makes Android redraw forever.
 */
export type Overlay = { node: ReactNode; bottom: number } | null;

let current: Overlay = null;
const listeners = new Set<() => void>();

export const floatingOverlay = {
  set(next: Overlay) {
    current = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => current,
};

export const useFloatingOverlay = () => useSyncExternalStore(floatingOverlay.subscribe, floatingOverlay.get);

/** The tabs' blur target, for BlurViews rendered in the overlay. */
export const TabsBlurTarget = createContext<RefObject<ComponentRef<typeof View> | null> | null>(null);
export const useTabsBlurTarget = () => useContext(TabsBlurTarget);
