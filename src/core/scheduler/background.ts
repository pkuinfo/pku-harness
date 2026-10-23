import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { bootCore } from '@/core/boot';
import { handleOngoingEvent, isOngoingActive, isOngoingEvent, ONGOING_PREFIX, ongoingRunner } from '@/core/cloud/ongoing';

import { BACKGROUND_TASK, runDueChecks, sync } from './engine';
import { dismissWake, EventType, isWakeEvent, notifee, RUN_NOTIFICATION, startRunService } from './exact-wake';

/**
 * Background entry point (expo-background-task / WorkManager). Must be defined at module
 * scope, so this file is imported from the root layout before anything renders.
 */
TaskManager.defineTask(BACKGROUND_TASK, async () => {
  try {
    await bootCore();
    await runDueChecks();
    await sync();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('background scheduler run failed', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Exact wake-ups (react-native-notify-kit): a job's alarm fired while the app was in the
 * background or killed. The run happens inside a short foreground service so Android doesn't
 * kill it mid-way (an agent run takes up to a minute or two); the service stops when done.
 */
notifee.registerForegroundService(async (notification) => {
  // notify-kit has one service and one runner: an ongoing activity (services.ongoing, e.g. a
  // live share) keeps it until stopped.
  if (notification.id?.startsWith(ONGOING_PREFIX)) return ongoingRunner();
  try {
    await bootCore();
    await runDueChecks();
    await sync();
  } catch (e) {
    console.warn('scheduled run failed', e);
  } finally {
    // A share started meanwhile shares this service: keep it, drop only our notification.
    if (isOngoingActive()) await notifee.cancelNotification(RUN_NOTIFICATION).catch(() => {});
    else await notifee.stopForegroundService().catch(() => {});
  }
});

/** Run due checks without a service of their own (one is already running, or it couldn't start). */
async function runDirect() {
  await bootCore();
  await runDueChecks();
  await sync();
}

notifee.onBackgroundEvent(async (e) => {
  if (isOngoingEvent(e)) {
    handleOngoingEvent(e);
    return;
  }
  if (e.type !== EventType.DELIVERED || !isWakeEvent(e)) return;
  try {
    // An ongoing activity already keeps the process alive, and stopping the shared service after
    // the run would end it: run in place.
    if (isOngoingActive()) await runDirect();
    else await startRunService(e.detail.notification?.body ?? '');
  } catch (err) {
    // Couldn't start the service (an OEM restriction, say): run directly as before.
    console.warn('foreground service start failed', err);
    await runDirect();
  } finally {
    await dismissWake(e);
  }
});
