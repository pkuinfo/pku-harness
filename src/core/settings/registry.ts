/**
 * The settings registry (docs/ARCHITECTURE.md §4.6): every setting the user can change, built in
 * or declared by a plugin (PluginDef.preferences), as one list of typed entries. The Settings
 * screens and the agent (core `settings` plugin, via HostServices.settings) read and write the
 * same stores through it, so the agent can do anything the screens can. Secrets and steps that
 * need the user's hands are `uiOnly`: listed with their screen, never set by the agent.
 */
import { isZoneId } from '@pku-harness/sdk';
import type { PluginDef, SettingChange, SettingInfo, SettingValue, ToolEffect } from '@pku-harness/sdk';
import { router } from 'expo-router';
import { z } from 'zod';

import { aiConfig } from '@/core/agent/provider';
import { getTimezonePreference, setTimezonePreference } from '@/core/clock/preference';
import { services } from '@/core/runtime/invoke';
import { pluginName } from '@/core/runtime/localize';
import { pluginSettings, type EffectMode } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { speechConfig } from '@/core/speech/config';
import { kv } from '@/core/store/kv';
import { getLocale, getLocalePreference, setLocalePreference, t, type LocalePreference } from '@/i18n';
import { getThemePreference, setThemePreference, type ThemePreference } from '@/theme';
import { hapticsEnabled, setHapticsEnabled } from '@/utils/haptics';

type Entry = Omit<SettingInfo, 'value'> & {
  read: () => SettingValue | null | Promise<SettingValue | null>;
  /** Validates and applies; absent for `uiOnly` entries. */
  write?: (value: unknown) => Promise<void>;
};

const EFFECTS: ToolEffect[] = ['read', 'write', 'money', 'public'];
const MODES: EffectMode[] = ['auto', 'ask', 'off'];

/** A choice among fixed values, validated against them. */
function choice<T extends string>(values: readonly T[], label: (v: T) => string, apply: (v: T) => void | Promise<void>) {
  return {
    kind: 'choice' as const,
    options: values.map((value) => ({ value, label: label(value) })),
    write: async (value: unknown) => {
      if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) throw new Error(`Choose one of: ${values.join(', ')}`);
      await apply(value as T);
    },
  };
}

function boolean(apply: (v: boolean) => void | Promise<void>) {
  return {
    kind: 'boolean' as const,
    write: async (value: unknown) => {
      if (typeof value !== 'boolean') throw new Error('Use true or false');
      await apply(value);
    },
  };
}

function appEntries(): Entry[] {
  const group = t('app.prefs.groupApp');
  const ai = aiConfig.get();
  const aiProvider = registry.provider(ai.providerId);
  const voice = speechConfig.snapshot();
  return [
    {
      key: 'app.theme', group, title: t('core.settings.appearance'), screen: '/settings', read: getThemePreference,
      ...choice<ThemePreference>(['system', 'light', 'dark'], (v) => t(v === 'system' ? 'core.settings.themeSystem' : v === 'dark' ? 'core.settings.themeDark' : 'core.settings.themeLight'), setThemePreference),
    },
    {
      key: 'app.language', group, title: t('core.settings.language'), screen: '/settings', read: getLocalePreference,
      ...choice<LocalePreference>(['system', 'zh-Hans', 'en'], (v) => t(v === 'system' ? 'core.settings.languageSystem' : v === 'zh-Hans' ? 'core.settings.languageZh' : 'core.settings.languageEn'), setLocalePreference),
    },
    {
      key: 'app.timezone', group, title: t('app.settings.timezone'), description: t('app.prefs.timezoneHint'), kind: 'text', screen: '/timezone',
      read: getTimezonePreference,
      write: async (value) => {
        if (typeof value !== 'string' || (value !== 'auto' && !isZoneId(value))) throw new Error('Use "auto" or an IANA time zone such as Asia/Shanghai');
        setTimezonePreference(value);
      },
    },
    { key: 'app.haptics', group, title: t('app.settings.haptics'), screen: '/settings', read: hapticsEnabled, ...boolean(setHapticsEnabled) },
    {
      key: 'ai.provider', group: t('app.prefs.groupAI'), title: t('app.prefs.aiProvider'), screen: '/ai-settings', read: () => ai.providerId,
      ...choice(registry.providers().map((p) => p.id), (id) => registry.provider(id)?.def.name ?? id, (id) => aiConfig.activate(id)),
    },
    {
      key: 'ai.model', group: t('app.prefs.groupAI'), title: t('app.prefs.aiModel'), kind: 'text', screen: '/ai-settings', read: () => ai.model,
      options: aiProvider?.def.models.map((m) => ({ value: m.id, label: m.name ?? m.id })),
      write: async (value) => {
        if (typeof value !== 'string' || !value.trim()) throw new Error('Give a model id');
        if (aiProvider && !aiProvider.def.editableBaseURL && !aiProvider.def.models.some((m) => m.id === value))
          throw new Error(`Choose one of: ${aiProvider.def.models.map((m) => m.id).join(', ')}`);
        await aiConfig.save(ai.providerId, { model: value.trim() }, { activate: true });
      },
    },
    ...(aiProvider?.def.efforts?.length
      ? [{
          key: 'ai.effort', group: t('app.prefs.groupAI'), title: t('app.prefs.aiEffort'), screen: '/model-picker', read: () => aiConfig.settingsFor(ai.providerId).effort ?? 'auto',
          ...choice(['auto', ...aiProvider.def.efforts] as const, (v) => t(`chat.model.effortLevels.${v}`), (v) => aiConfig.save(ai.providerId, { effort: v }, { activate: false })),
        }]
      : []),
    { key: 'ai.apiKey', group: t('app.prefs.groupAI'), title: t('app.prefs.aiKey'), kind: 'text', uiOnly: true, screen: '/ai-settings', read: () => null },
    {
      key: 'voice.provider', group: t('app.prefs.groupAI'), title: t('app.prefs.voiceProvider'), screen: '/voice-settings', read: () => voice.providerId,
      ...choice(registry.speechProviders().map((p) => p.id), (id) => registry.speechProvider(id)?.def.name ?? id, (id) => speechConfig.save(id, {})),
    },
    { key: 'voice.apiKey', group: t('app.prefs.groupAI'), title: t('app.prefs.voiceKey'), kind: 'text', uiOnly: true, screen: '/voice-settings', read: () => null },
    { key: 'campus.account', group, title: t('app.settings.campus'), kind: 'text', uiOnly: true, screen: '/campus', read: () => null },
    { key: 'app.notifications', group, title: t('app.settings.reminders'), kind: 'text', uiOnly: true, screen: '/notifications', read: () => null },
  ];
}

/** Each plugin's switch (unless it is core), its permission per effect, and its own preferences. */
function pluginEntries(p: PluginDef): Entry[] {
  const group = pluginName(p);
  const screen = `/plugins/${p.id}`;
  const out: Entry[] = [];
  if (!p.core)
    out.push({
      key: `plugin.${p.id}.enabled`, group, title: t('app.prefs.pluginEnabled'), screen, read: () => pluginSettings.get(p.id).enabled,
      ...boolean((enabled) => pluginSettings.update(p.id, { enabled })),
    });
  if (Object.keys(p.tools ?? {}).length)
    for (const effect of EFFECTS)
      out.push({
        key: `plugin.${p.id}.permission.${effect}`, group, title: t('app.prefs.permission', { effect: t(`app.prefs.effects.${effect}`) }), screen,
        read: () => pluginSettings.get(p.id).modes[effect],
        ...choice(MODES, (m) => t(`app.prefs.modes.${m}`), (mode) => pluginSettings.update(p.id, { modes: { ...pluginSettings.get(p.id).modes, [effect]: mode } })),
      });
  const text = getLocale() === 'en' ? p.i18n?.en?.preferences : undefined;
  const ctx = { kv: kv(`plugin:${p.id}`), services };
  const firstScreen = Object.keys(p.contributes?.screens ?? {})[0];
  for (const [name, def] of Object.entries(p.preferences ?? {}))
    out.push({
      key: `${p.id}.${name}`, group, title: text?.[name]?.title ?? def.title, description: text?.[name]?.description ?? def.description,
      kind: def.kind, options: def.options?.map((o) => ({ ...o, label: text?.[name]?.options?.[o.value] ?? o.label })),
      screen: def.screen ?? (firstScreen ? `/p/${p.id}/${firstScreen}` : screen),
      read: () => def.get(ctx),
      write: async (value) => {
        const parsed = def.input.safeParse(value);
        if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
        await def.set(ctx, parsed.data);
      },
    });
  return out;
}

function entries(): Entry[] {
  return [...appEntries(), ...registry.list().filter((p) => !p.remote || p.tools).flatMap(pluginEntries)];
}

async function info(e: Entry): Promise<SettingInfo> {
  const { read: _read, write: _write, ...rest } = e;
  let value: SettingValue | null = null;
  try {
    value = (await e.read()) ?? null;
  } catch {}
  return { ...rest, value };
}

export const settingsRegistry = {
  async list(): Promise<SettingInfo[]> {
    return Promise.all(entries().map(info));
  },

  /** All changes are checked first (known key, not uiOnly); each value is validated as it is applied. */
  async change(changes: { key: string; value: SettingValue }[]): Promise<SettingChange[]> {
    const all = new Map(entries().map((e) => [e.key, e]));
    for (const c of changes) {
      const e = all.get(c.key);
      if (!e) throw new Error(`Unknown setting "${c.key}"; find keys with settings__list`);
      if (e.uiOnly || !e.write) throw new Error(`"${c.key}" can only be changed by the user; open its screen with settings__open`);
    }
    const out: SettingChange[] = [];
    for (const c of changes) {
      const e = all.get(c.key)!;
      const before = (await info(e)).value;
      await e.write!(c.value);
      out.push({ key: c.key, before, after: (await info(entries().find((x) => x.key === c.key) ?? e)).value });
    }
    return out;
  },

  open(key: string) {
    const e = entries().find((x) => x.key === key);
    if (!e?.screen) throw new Error(`Unknown setting "${key}"`);
    router.push(e.screen as never);
  },
};
