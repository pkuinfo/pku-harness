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

export const EFFECT_ORDER: ToolEffect[] = ['read', 'write', 'money', 'public'];

export const modeOptions = (t: Translate): { label: string; value: EffectMode }[] => [
  { label: t('app.plugins.modes.auto'), value: 'auto' },
  { label: t('app.plugins.modes.ask'), value: 'ask' },
  { label: t('app.plugins.modes.off'), value: 'off' },
];

/** Effects a plugin actually uses, in display order. */
export function effectsOf(plugin: PluginDef): ToolEffect[] {
  const used = new Set(Object.values(plugin.tools).map((t) => t.effect));
  return EFFECT_ORDER.filter((e) => used.has(e));
}

export const pluginIcon = (plugin: PluginDef): IconName => (plugin.icon as IconName | undefined) ?? 'puzzle';
