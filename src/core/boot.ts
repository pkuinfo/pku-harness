import { aiConfig } from '@/core/agent/provider';
import { campusAccount } from '@/core/campus/account';
import { chatStore } from '@/core/agent/session/chat-store';
import { initCloud } from '@/core/cloud/runtime';
import { installLogScrubber } from '@/core/cloud/secret-link';
import { seedStarterWidgets } from '@/core/dashboard/starter';
import { widgetStore } from '@/core/dashboard/store';
import { initNotifications } from '@/core/notify';
import { installApprovalHandler } from '@/core/runtime/approvals';
import { migrateJob, migrateWidget } from '@/core/runtime/legacy';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { remotePlugins } from '@/core/runtime/remote';
import { startScheduler } from '@/core/scheduler/engine';
import { installServices } from '@/core/services';
import { jobStore } from '@/core/scheduler/store';
import { timetable } from '@/core/timetable/store';
import { todoStore } from '@/core/todo/store';
import { kv } from '@/core/store/kv';
import { builtinPlugins } from '@pku-harness/plugins';
import { getLocalePreference, setLocalePreference, subscribeLocale, type LocalePreference } from '@/i18n';
import { getThemePreference, setThemePreference, subscribeThemePreference, type ThemePreference } from '@/theme';

let core: Promise<void> | null = null;
let onboarded = true;

/** Whether the first-run welcome has been completed (read during boot). */
export const isOnboarded = () => onboarded;
export const markOnboarded = () => {
  onboarded = true;
};

/**
 * First-run setup progress (src/screens/welcome/flow.ts owns its shape): saved after every step
 * so killing the app mid-setup resumes at the same step. Cleared once onboarding completes.
 */
const ONBOARDING_KEY = 'onboarding';
let onboarding: unknown = null;

export const onboardingProgress = {
  get: () => onboarding,
  async set(value: unknown) {
    onboarding = value;
    await kv('prefs').set(ONBOARDING_KEY, value);
  },
  async clear() {
    onboarding = null;
    await kv('prefs').delete(ONBOARDING_KEY);
  },
};

/** End of the first run: remember it, drop the saved progress, let the tabs through. */
export async function completeOnboarding() {
  markOnboarded();
  await kv('prefs').set('onboarded', true);
  await onboardingProgress.clear();
}
let app: Promise<void> | null = null;

/**
 * Rewrite stored ids of replaced plugins (PluginDef.legacy, e.g. campus-card → wallet) in
 * dashboard widgets and scheduled checks. Lookups resolve old ids anyway (registry aliases); this
 * keeps cache keys and write invalidation on the new ids. Idempotent: rewritten rows no longer match.
 */
async function migrateLegacyIds() {
  const aliases = registry.aliases();
  if (!aliases.tools.size && !aliases.widgets.size) return;
  for (const w of widgetStore.list()) {
    const next = migrateWidget(w, aliases);
    if (next) await widgetStore.put(next);
  }
  for (const j of jobStore.list()) {
    const next = migrateJob(j, aliases);
    if (next) await jobStore.put(next);
  }
}

/** Runtime without UI: plugins, settings, AI config, jobs. Used by background tasks too. */
export function bootCore(): Promise<void> {
  if (!core) {
    core = (async () => {
      installLogScrubber();
      installServices();
      for (const p of builtinPlugins) registry.register(p);
      await remotePlugins.load().catch((e) => console.warn('remote plugins failed to load', e));
      await Promise.all([pluginSettings.load(), aiConfig.load(), jobStore.load(), widgetStore.load(), todoStore.load(), timetable.load(), campusAccount.load()]);
      await migrateLegacyIds().catch((e) => console.warn('legacy id migration failed', e));
      // Cloud provider + plugin bindings (no network until something needs it).
      await initCloud().catch((e) => console.warn('cloud init failed', e));
    })();
  }
  return core;
}

/** Full app boot: core + UI preferences, chat, notifications, scheduler. Idempotent. */
export function boot(): Promise<void> {
  if (!app) {
    app = (async () => {
      await bootCore();
      installApprovalHandler();
      const prefs = kv('prefs');
      onboarded = !!(await prefs.get<boolean>('onboarded'));
      onboarding = onboarded ? null : ((await prefs.get<unknown>(ONBOARDING_KEY)) ?? null);
      const theme = await prefs.get<ThemePreference>('theme');
      if (theme) setThemePreference(theme);
      subscribeThemePreference(() => prefs.set('theme', getThemePreference()));
      const locale = await prefs.get<LocalePreference>('locale');
      if (locale) setLocalePreference(locale);
      subscribeLocale(() => prefs.set('locale', getLocalePreference()));
      await Promise.all([chatStore.load(), seedStarterWidgets()]);
      initNotifications()
        .then(startScheduler)
        .catch((e) => console.warn('scheduler start failed', e));
    })();
  }
  return app;
}
