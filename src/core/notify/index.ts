import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { t, type MessageKey } from '@/i18n';

/**
 * Local notifications (docs/ARCHITECTURE.md §8). Everything that shows a notification goes
 * through here so channels, permissions and the foreground handler stay in one place.
 */

/** Channel names show in Android's notification settings; they are (re)registered in the app language at startup. */
export const CHANNELS: Record<'reminders' | 'alerts', { id: string; name: MessageKey; description: MessageKey }> = {
  reminders: { id: 'reminders', name: 'app.notifications.channels.reminders', description: 'app.notifications.channels.remindersDescription' },
  alerts: { id: 'alerts', name: 'app.notifications.channels.alerts', description: 'app.notifications.channels.alertsDescription' },
};

export type ChannelId = keyof typeof CHANNELS;

export type PermissionState = 'granted' | 'denied' | 'undetermined';

let initialized = false;

/** Install the foreground handler and Android channels. Safe to call more than once. */
export async function initNotifications() {
  if (initialized) return;
  initialized = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    for (const ch of Object.values(CHANNELS)) {
      await Notifications.setNotificationChannelAsync(ch.id, {
        name: t(ch.name),
        description: t(ch.description),
        importance: AndroidImportance.HIGH,
      });
    }
  }
}

export async function getNotificationPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  await initNotifications();
  const p = await Notifications.requestPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** Android 12+: exact alarms make reminders fire on the minute instead of "around then". */
export async function getExactAlarmPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return (await Notifications.getExactAlarmPermissionsAsync()).granted;
}

/** Opens the system screen; resolves when the user comes back. */
export async function requestExactAlarmPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
}

export type NotifyContent = {
  title: string;
  body?: string;
  /** In-app route to open on tap. */
  url?: string;
  data?: Record<string, unknown>;
  channel?: ChannelId;
};

const content = (c: NotifyContent): Notifications.NotificationContentInput => ({
  title: c.title,
  body: c.body,
  data: { ...c.data, ...(c.url ? { url: c.url } : null) },
  sound: 'default',
});

/** Show a notification now. */
export async function notifyNow(c: NotifyContent) {
  await initNotifications();
  return Notifications.scheduleNotificationAsync({
    content: content(c),
    trigger: Platform.OS === 'android' ? { channelId: CHANNELS[c.channel ?? 'alerts'].id } : null,
  });
}

/**
 * Schedule a notification at an exact instant. Uses `setExactAndAllowWhileIdle` when the
 * exact-alarm permission is granted (expo-notifications ExpoSchedulingDelegate), else inexact.
 */
export async function notifyAt(at: Date, c: NotifyContent, identifier?: string) {
  await initNotifications();
  return Notifications.scheduleNotificationAsync({
    identifier,
    content: content(c),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNELS[c.channel ?? 'reminders'].id,
    },
  });
}

export function cancelNotification(identifier: string) {
  return Notifications.cancelScheduledNotificationAsync(identifier);
}

export function listScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}
