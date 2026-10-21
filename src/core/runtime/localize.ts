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

export const commandText = (
  p: PluginDef | undefined,
  command: string,
  src: { description: string; argHint?: string; aliases?: string[]; prompt?: string },
  locale: Locale = getLocale(),
) => {
  const o = overlay(p, locale)?.commands?.[command];
  return {
    description: o?.description ?? src.description,
    argHint: o?.argHint ?? src.argHint,
    aliases: [...(src.aliases ?? []), ...(o?.aliases ?? [])],
    // Prompt commands send their template as the user's message: in English when translated.
    ...(src.prompt !== undefined ? { prompt: o?.prompt ?? src.prompt } : {}),
  };
};

/** A provider plugin's display strings (`providerId` is the provider key inside the plugin). */
export const providerText = (
  p: PluginDef | undefined,
  providerKey: string,
  src: { name: string; description: string; credentialHint?: string },
  locale: Locale = getLocale(),
) => {
  const o = overlay(p, locale)?.providers?.[providerKey];
  return { name: o?.name ?? src.name, description: o?.description ?? src.description, credentialHint: o?.credentialHint ?? src.credentialHint };
};

export const modelText = (p: PluginDef | undefined, providerKey: string, model: { id: string; name?: string; description?: string }, locale: Locale = getLocale()) => {
  const o = overlay(p, locale)?.providers?.[providerKey]?.models?.[model.id];
  return { name: o?.name ?? model.name, description: o?.description ?? model.description };
};

export const dataSourceTitle = (p: PluginDef | undefined, source: string, fallback: string, locale: Locale = getLocale()) =>
  overlay(p, locale)?.dataSources?.[source]?.title ?? fallback;
