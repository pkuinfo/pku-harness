import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { bootCore } from '@/core/boot';

import { BACKGROUND_TASK, runDueChecks, sync } from './engine';
import { dismissWake, EventType, isWakeEvent, notifee } from './exact-wake';

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
 * Exact wake-ups (react-native-notify-kit): a check job's trigger fired while the app was in the
 * background or killed. Runs headless, so it boots the runtime without UI.
 */
notifee.onBackgroundEvent(async (e) => {
  if (e.type !== EventType.DELIVERED || !isWakeEvent(e)) return;
  try {
    await bootCore();
    await runDueChecks();
    await sync();
  } finally {
    await dismissWake(e);
  }
});
