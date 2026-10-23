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

/** iOS provisional (quiet, in Notification Center only) is not enough for reminders. IosAuthorizationStatus.PROVISIONAL. */
const IOS_PROVISIONAL = 3;
const iosQuiet = (p: Notifications.NotificationPermissionsStatus) => Platform.OS === 'ios' && p.ios?.status === IOS_PROVISIONAL;

export async function getNotificationPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted && !iosQuiet(p)) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  await initNotifications();
  // iOS: ask for real alerts (not provisional, which arrives silently and defeats reminders).
  const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: true } });
  if (p.granted && !iosQuiet(p)) return 'granted';
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

/**
 * Android may defer or kill background work for battery optimisation (and some OEMs more than
 * stock). Unrestricted keeps exact wake-ups and their network access reliable. True = optimised
 * (restricted).
 */
export async function getBatteryOptimized(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const { default: notifee } = await import('react-native-notify-kit');
  return notifee.isBatteryOptimizationEnabled();
}

/** Opens the system battery settings for this app (no special permission needed). */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { default: notifee } = await import('react-native-notify-kit');
  await notifee.openBatteryOptimizationSettings();
}

/** What on-time delivery depends on, for the welcome step, Settings and the Schedule tab. */
export type DeliveryReadiness = { notifications: PermissionState; exactAlarms: boolean; batteryOptimized: boolean };

export async function deliveryReadiness(): Promise<DeliveryReadiness> {
  const [notifications, exactAlarms, batteryOptimized] = await Promise.all([
    getNotificationPermission(),
    getExactAlarmPermission(),
    getBatteryOptimized().catch(() => false),
  ]);
  return { notifications, exactAlarms, batteryOptimized };
}

export type NotifyContent = {
  /**
   * iOS interruption level: 'timeSensitive' breaks through Focus and the summary (reminders,
   * alerts the user asked for; needs the time-sensitive entitlement in app.json), 'passive' for
   * status notices. Default by channel: reminders/alerts → timeSensitive, others → active.
   */
  urgency?: 'timeSensitive' | 'active' | 'passive';
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
  interruptionLevel: c.urgency ?? (c.channel === 'reminders' || c.channel === 'alerts' || c.channel == null ? 'timeSensitive' : 'active'),
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
 * Schedule a notification at an exact instant: `setAlarmClock` (delivery 'alarmClock', Expo SDK
 * 58) when the exact-alarm permission is granted, else best effort.
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
      // setAlarmClock: never deferred by Doze or battery saver (falls back to setExactAndAllowWhileIdle
      // without the exact-alarm permission). Reminders are promises about a minute.
      delivery: 'alarmClock',
    },
  });
}

/** Dismiss shown notifications whose data has `kind` (e.g. earlier test reminders still in the shade). */
export async function dismissPresented(kind: string) {
  const shown = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(shown.filter((n) => n.request.content.data?.kind === kind).map((n) => Notifications.dismissNotificationAsync(n.request.identifier)));
}

export function cancelNotification(identifier: string) {
  return Notifications.cancelScheduledNotificationAsync(identifier);
}

export function listScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}
