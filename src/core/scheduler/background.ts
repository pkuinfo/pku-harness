import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { bootCore } from '@/core/boot';

import { BACKGROUND_TASK, runDueChecks, sync } from './engine';

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
