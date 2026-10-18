import { aiConfig } from '@/core/agent/provider';
import { chatStore } from '@/core/agent/chat-store';
import { initNotifications } from '@/core/notify';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { kv } from '@/core/store/kv';
import { builtinPlugins } from '@/plugins';
import { getThemePreference, setThemePreference, subscribeThemePreference, type ThemePreference } from '@/theme';

let booted: Promise<void> | null = null;

/** Register built-in plugins and hydrate persisted state. Idempotent. */
export function boot(): Promise<void> {
  if (!booted) {
    booted = (async () => {
      for (const p of builtinPlugins) registry.register(p);
      const prefs = kv('prefs');
      const theme = await prefs.get<ThemePreference>('theme');
      if (theme) setThemePreference(theme);
      subscribeThemePreference(() => prefs.set('theme', getThemePreference()));
      await Promise.all([pluginSettings.load(), aiConfig.load(), chatStore.load()]);
      initNotifications().catch((e) => console.warn('notifications init failed', e));
    })();
  }
  return booted;
}
