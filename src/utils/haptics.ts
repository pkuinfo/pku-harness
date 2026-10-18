import * as Haptics from 'expo-haptics';

/** Thin wrapper so haptics can be disabled globally and never throw. */
let enabled = true;

export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

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
