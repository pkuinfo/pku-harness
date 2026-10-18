import { aiConfig } from '@/core/agent/provider';
import { chatStore } from '@/core/agent/chat-store';
import { seedStarterWidgets } from '@/core/dashboard/starter';
import { widgetStore } from '@/core/dashboard/store';
import { initNotifications } from '@/core/notify';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { startScheduler } from '@/core/scheduler/engine';
import { jobStore } from '@/core/scheduler/store';
import { timetable } from '@/core/timetable/store';
import { todoStore } from '@/core/todo/store';
import { kv } from '@/core/store/kv';
import { builtinPlugins } from '@/plugins';
import { getThemePreference, setThemePreference, subscribeThemePreference, type ThemePreference } from '@/theme';

let core: Promise<void> | null = null;
let app: Promise<void> | null = null;

/** Runtime without UI: plugins, settings, AI config, jobs. Used by background tasks too. */
export function bootCore(): Promise<void> {
  if (!core) {
    core = (async () => {
      for (const p of builtinPlugins) registry.register(p);
      await Promise.all([pluginSettings.load(), aiConfig.load(), jobStore.load(), widgetStore.load(), todoStore.load(), timetable.load()]);
    })();
  }
  return core;
}

/** Full app boot: core + UI preferences, chat, notifications, scheduler. Idempotent. */
export function boot(): Promise<void> {
  if (!app) {
    app = (async () => {
      await bootCore();
      const prefs = kv('prefs');
      const theme = await prefs.get<ThemePreference>('theme');
      if (theme) setThemePreference(theme);
      subscribeThemePreference(() => prefs.set('theme', getThemePreference()));
      await Promise.all([chatStore.load(), seedStarterWidgets()]);
      initNotifications()
        .then(startScheduler)
        .catch((e) => console.warn('scheduler start failed', e));
    })();
  }
  return app;
}
