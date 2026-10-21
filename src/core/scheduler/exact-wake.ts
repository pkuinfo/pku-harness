import { Platform } from 'react-native';
import notifee, { AlarmType, AndroidImportance, AndroidVisibility, EventType, TriggerType, type Event } from 'react-native-notify-kit';

import { t } from '@/i18n';

import type { Job } from './types';

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

const wakeId = (job: Job) => `${WAKE_PREFIX}${job.id}:${job.nextRunAt}`;

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
  const wanted = jobs.filter((j) => j.enabled && j.action.type === 'check' && j.nextRunAt != null && j.nextRunAt > Date.now());
  const want = new Map(wanted.map((j) => [wakeId(j), j]));
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
      { type: TriggerType.TIMESTAMP, timestamp: job.nextRunAt!, alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE } },
    );
  }
}

/** Remove the placeholder notification of a wake event. */
export async function dismissWake(e: Event) {
  const id = e.detail.notification?.id;
  if (id) await notifee.cancelNotification(id).catch(() => {});
}

export { EventType, notifee };
