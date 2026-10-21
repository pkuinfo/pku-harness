/**
 * Plugin manifest strings in the app language (docs/AGENT-HARNESS.md §8). The Chinese fields
 * are the source; `plugin.i18n.en` overlays them when the app is in English. Use these
 * wherever the host shows a plugin's name, tool title, widget, screen, settings row or command.
 */
import { getLocale, type Locale } from '@/i18n';

import type { PluginDef } from './types';

type Overlay = NonNullable<NonNullable<PluginDef['i18n']>['en']>;

const overlay = (p: Pick<PluginDef, 'i18n'> | undefined, locale: Locale): Overlay | undefined => (locale === 'en' ? p?.i18n?.en : undefined);

export const pluginName = (p: PluginDef, locale: Locale = getLocale()) => overlay(p, locale)?.name ?? p.name;

export const pluginDescription = (p: PluginDef, locale: Locale = getLocale()) => overlay(p, locale)?.description ?? p.description;

/** `tool` is the tool's name inside the plugin (not the full `plugin.tool` id). */
export const toolTitle = (p: PluginDef | undefined, tool: string, fallback: string, locale: Locale = getLocale()) =>
  overlay(p, locale)?.tools?.[tool]?.title ?? fallback;

export const widgetText = (p: PluginDef | undefined, widget: string, src: { title: string; description?: string }, locale: Locale = getLocale()) => {
  const o = overlay(p, locale)?.widgets?.[widget];
  return { title: o?.title ?? src.title, description: o?.description ?? src.description };
};

export const screenTitle = (p: PluginDef | undefined, screen: string, fallback: string, locale: Locale = getLocale()) =>
  overlay(p, locale)?.screens?.[screen]?.title ?? fallback;

export const settingsRowText = (p: PluginDef | undefined, screen: string, src: { title: string; subtitle?: string }, locale: Locale = getLocale()) => {
  const o = overlay(p, locale)?.settings?.[screen];
  return { title: o?.title ?? src.title, subtitle: o?.subtitle ?? src.subtitle };
};

export const commandText = (p: PluginDef | undefined, command: string, src: { description: string; argHint?: string; aliases?: string[] }, locale: Locale = getLocale()) => {
  const o = overlay(p, locale)?.commands?.[command];
  return { description: o?.description ?? src.description, argHint: o?.argHint ?? src.argHint, aliases: [...(src.aliases ?? []), ...(o?.aliases ?? [])] };
};

export const dataSourceTitle = (p: PluginDef | undefined, source: string, fallback: string, locale: Locale = getLocale()) =>
  overlay(p, locale)?.dataSources?.[source]?.title ?? fallback;
