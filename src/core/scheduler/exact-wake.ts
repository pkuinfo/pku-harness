import { Platform } from 'react-native';
import notifee, { AlarmType, AndroidForegroundServiceType, AndroidImportance, AndroidVisibility, EventType, TriggerType, type Event } from 'react-native-notify-kit';

import { getExactAlarmPermission } from '@/core/notify';
import { t } from '@/i18n';

import { runsInJs, type Job } from '@pku-harness/sdk';

/**
 * Exact background wake-ups for `check` jobs (docs/ARCHITECTURE.md §8, T6.5).
 *
 * expo-notifications can show a notification at an exact time but cannot run JS then, and
 * expo-background-task is inexact. react-native-notify-kit schedules an AlarmManager trigger
 * (`setExactAndAllowWhileIdle`) whose DELIVERED event starts a headless JS task even when the
 * app is killed. Each enabled check job gets one trigger at its next run on a silent,
 * minimum-importance channel; the handler runs the due checks, re-arms, and removes the
 * placeholder notification within a second or two.
 */

export const WAKE_PREFIX = 'wake:';
const CHANNEL = 'checks';

const wakeId = (job: Job, exact: boolean) => `${WAKE_PREFIX}${job.id}:${job.nextRunAt}:${exact ? 'x' : 'i'}`;

export const isWakeEvent = (e: Event) => !!e.detail.notification?.id?.startsWith(WAKE_PREFIX);

let channelReady: Promise<string> | null = null;
function ensureChannel() {
  channelReady ??= notifee.createChannel({
    id: CHANNEL,
    name: t('app.notifications.channels.checks'),
    description: t('app.notifications.channels.checksDescription'),
    importance: AndroidImportance.MIN,
    visibility: AndroidVisibility.SECRET,
    sound: undefined,
    vibration: false,
  });
  return channelReady;
}

/** Make the armed wake triggers match the enabled check jobs. */
export async function syncWakeups(jobs: Job[]) {
  if (Platform.OS !== 'android') return;
  await ensureChannel();
  const wanted = jobs.filter((j) => j.enabled && runsInJs(j.action) && j.nextRunAt != null && j.nextRunAt > Date.now());
  // setAlarmClock: on the minute, and Android leaves Doze just before it fires, so the run has
  // network. Without the exact-alarm permission it would throw: fall back to a deferrable alarm.
  const exact = await getExactAlarmPermission().catch(() => false);
  const alarm = exact ? AlarmType.SET_ALARM_CLOCK : AlarmType.SET_AND_ALLOW_WHILE_IDLE;
  const want = new Map(wanted.map((j) => [wakeId(j, exact), j]));
  const have = (await notifee.getTriggerNotificationIds()).filter((id) => id.startsWith(WAKE_PREFIX));
  for (const id of have) if (!want.has(id)) await notifee.cancelNotification(id);
  for (const [id, job] of want) {
    if (have.includes(id)) continue;
    await notifee.createTriggerNotification(
      {
        id,
        title: t('app.notifications.channels.checking'),
        body: job.title,
        data: { jobId: job.id },
        android: { channelId: CHANNEL, importance: AndroidImportance.MIN, autoCancel: true, onlyAlertOnce: true },
      },
      { type: TriggerType.TIMESTAMP, timestamp: job.nextRunAt!, alarmManager: { type: alarm } },
    );
  }
}

/**
 * Keep the process alive for the run: a headless JS task alone can be killed within seconds,
 * and an agent run takes up to a minute or two. Starting a foreground service right after an
 * exact alarm is an allowed background start; `shortService` gives ~3 minutes and needs no
 * extra permission (declared through the notify-kit config plugin in app.json).
 */
export const RUN_NOTIFICATION = 'sched-run';

export async function startRunService(title: string) {
  await ensureChannel();
  await notifee.displayNotification({
    id: RUN_NOTIFICATION,
    title: t('app.notifications.channels.checking'),
    body: title,
    android: {
      channelId: CHANNEL,
      importance: AndroidImportance.MIN,
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE],
      ongoing: true,
      onlyAlertOnce: true,
    },
  });
}

/** Remove the placeholder notification of a wake event. */
export async function dismissWake(e: Event) {
  const id = e.detail.notification?.id;
  if (id) await notifee.cancelNotification(id).catch(() => {});
}

export { EventType, notifee };
