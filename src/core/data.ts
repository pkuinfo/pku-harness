import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';

import { chatStore } from '@/core/agent/chat-store';
import { aiConfig } from '@/core/agent/provider';
import { seedStarterWidgets } from '@/core/dashboard/starter';
import { widgetStore } from '@/core/dashboard/store';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { remotePlugins } from '@/core/runtime/remote';
import { BACKGROUND_TASK } from '@/core/scheduler/engine';
import { jobStore } from '@/core/scheduler/store';
import { getDb } from '@/core/store/db';
import { secrets } from '@/core/store/secrets';
import { timetable } from '@/core/timetable/store';
import { todoStore } from '@/core/todo/store';

/** Everything the user created, as JSON. Secrets (API keys, campus password, tokens) are never exported. */
export async function exportData() {
  const db = await getDb();
  const kvRows = await db.getAllAsync<{ ns: string; key: string; value: string }>('SELECT ns, key, value FROM kv');
  return {
    app: 'pku-harness',
    exportedAt: new Date().toISOString(),
    version: 1,
    jobs: jobStore.list(),
    todos: todoStore.list(),
    widgets: widgetStore.list(),
    timetable: timetable.get(),
    kv: kvRows.filter((r) => r.ns !== 'chat').map((r) => ({ ns: r.ns, key: r.key, value: JSON.parse(r.value) })),
  };
}

/** Delete all local data and secrets, cancel notifications, then reload stores to a fresh state. */
export async function resetData() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK).catch(() => {});
  for (const m of remotePlugins.list()) await remotePlugins.uninstall(m.id);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const table of ['kv', 'messages', 'sessions', 'widgets', 'jobs', 'todos', 'cache']) await db.execAsync(`DELETE FROM ${table}`);
  });
  for (const key of ['ai.apiKey', 'campus.username', 'campus.password', 'campus.otpSecret'] as const) await secrets.delete(key).catch(() => {});
  for (const p of registry.providers()) await secrets.delete(`ai.${p.id}.apiKey`).catch(() => {});
  chatStore.clear();
  await Promise.all([pluginSettings.load(), aiConfig.load(), jobStore.load(), widgetStore.load(), todoStore.load(), timetable.load()]);
  await seedStarterWidgets();
}
