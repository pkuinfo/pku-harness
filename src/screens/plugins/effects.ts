import type { ChipTone } from '@/components/chip';
import type { IconName } from '@/components/icon';
import type { EffectMode } from '@/core/runtime/plugin-settings';
import type { PluginDef, ToolEffect } from '@/core/runtime/types';
import type { useT } from '@/i18n';

/** The translate function from `useT()`, so labels follow the app language on re-render. */
type Translate = ReturnType<typeof useT>;

const TONE: Record<ToolEffect, ChipTone> = { read: 'info', write: 'warn', money: 'down', public: 'accent' };

/** Label, hint and chip tone for one tool effect. */
export const effectInfo = (e: ToolEffect, t: Translate) => ({
  label: t(`app.plugins.effects.${e}`),
  hint: t(`app.plugins.effects.${e}Hint`),
  tone: TONE[e],
});

const EFFECT_ICON: Record<ToolEffect, IconName> = { read: 'eye', write: 'edit', money: 'wallet', public: 'globe' };
export const effectIcon = (e: ToolEffect) => EFFECT_ICON[e];

export const EFFECT_ORDER: ToolEffect[] = ['read', 'write', 'money', 'public'];

const MODE_ICON: Record<EffectMode, IconName> = { auto: 'bolt', ask: 'help', off: 'lock' };
/** Theme colour per mode: the pill's dot and the menu icon share it. */
export const MODE_TONE = { auto: 'up', ask: 'warn', off: 'textFaint' } as const satisfies Record<EffectMode, string>;

/** Allow / Ask first / Never, each with a one-line description (the permission menu). */
export const modeOptions = (t: Translate): { label: string; description: string; icon: IconName; value: EffectMode }[] =>
  (['auto', 'ask', 'off'] as const).map((value) => ({
    value,
    label: t(`app.plugins.modes.${value}`),
    description: t(`app.plugins.modes.${value}Hint`),
    icon: MODE_ICON[value],
  }));

/** Effects a plugin actually uses, in display order. */
export function effectsOf(plugin: PluginDef): ToolEffect[] {
  const used = new Set(Object.values(plugin.tools).map((t) => t.effect));
  return EFFECT_ORDER.filter((e) => used.has(e));
}

export const pluginIcon = (plugin: PluginDef): IconName => (plugin.icon as IconName | undefined) ?? 'puzzle';
