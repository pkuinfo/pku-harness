import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { bootCore } from '@/core/boot';

import { BACKGROUND_TASK, runDueChecks, sync } from './engine';
import { dismissWake, EventType, isWakeEvent, notifee, startRunService } from './exact-wake';

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
notifee.registerForegroundService(async () => {
  try {
    await bootCore();
    await runDueChecks();
    await sync();
  } catch (e) {
    console.warn('scheduled run failed', e);
  } finally {
    await notifee.stopForegroundService().catch(() => {});
  }
});

notifee.onBackgroundEvent(async (e) => {
  if (e.type !== EventType.DELIVERED || !isWakeEvent(e)) return;
  try {
    await startRunService(e.detail.notification?.body ?? '');
  } catch (err) {
    // Couldn't start the service (an OEM restriction, say): run directly as before.
    console.warn('foreground service start failed', err);
    await bootCore();
    await runDueChecks();
    await sync();
  } finally {
    await dismissWake(e);
  }
});
