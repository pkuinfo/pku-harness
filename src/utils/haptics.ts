import * as Haptics from 'expo-haptics';
import { useSyncExternalStore } from 'react';

/**
 * Thin wrapper so haptics can be disabled globally (Settings › Haptic feedback, persisted by
 * src/core/boot.ts) and never throw. Plugins get the same object through the host.
 */
let enabled = true;
const listeners = new Set<() => void>();

export function setHapticsEnabled(value: boolean) {
  enabled = value;
  listeners.forEach((l) => l());
}

export const hapticsEnabled = () => enabled;

export function subscribeHaptics(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useHapticsEnabled = () => useSyncExternalStore(subscribeHaptics, hapticsEnabled);

export const haptics = {
  tap() {
    if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  select() {
    if (enabled) Haptics.selectionAsync().catch(() => {});
  },
  success() {
    if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning() {
    if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};
