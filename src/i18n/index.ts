/**
 * App language (docs/AGENT-HARNESS.md §8): Simplified Chinese and English. The preference is
 * 'system' (follow the device's language list) or a fixed locale; it's persisted in boot.ts
 * next to the theme preference and changeable in Settings → 语言 / Language.
 *
 * Strings live in typed dictionaries (./messages): `zh-Hans` is the source of truth and `en`
 * must have exactly the same keys (a missing translation is a type error). Use `t()` outside
 * React and `useT()` in components (re-renders on language change).
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { en } from './messages/en';
import { zhHans, type Messages } from './messages/zh-Hans';

export type Locale = 'zh-Hans' | 'en';
export type LocalePreference = 'system' | Locale;
export const LOCALES: Locale[] = ['zh-Hans', 'en'];

const dictionaries: Record<Locale, Messages> = { 'zh-Hans': zhHans, en };

/** First supported language in the device's list; Chinese of any script/region → zh-Hans. */
export function systemLocale(): Locale {
  try {
    // Lazy require: a dev client built before expo-localization was added has no native module,
    // and a top-level import would throw at startup (blank app). Fall back to Chinese then.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLocales } = require('expo-localization') as typeof import('expo-localization');
    for (const l of getLocales()) {
      if (l.languageCode === 'zh') return 'zh-Hans';
      if (l.languageCode === 'en') return 'en';
    }
  } catch {
    // Native module unavailable (tests): fall through.
  }
  return 'zh-Hans';
}

let preference: LocalePreference = 'system';
let system: Locale = systemLocale();
let current: Locale = system;
const listeners = new Set<() => void>();

function update() {
  const next = preference === 'system' ? system : preference;
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

// Android lets users change the language without restarting apps: re-read on foreground.
AppState.addEventListener('change', (s) => {
  if (s !== 'active') return;
  system = systemLocale();
  update();
});

export function setLocalePreference(next: LocalePreference) {
  preference = next;
  update();
  listeners.forEach((l) => l());
}
export const getLocalePreference = () => preference;
export const getLocale = () => current;

export function subscribeLocale(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const useLocale = () => useSyncExternalStore(subscribeLocale, getLocale);
export const useLocalePreference = () => useSyncExternalStore(subscribeLocale, getLocalePreference);

// ---------------------------------------------------------------- lookup

/** Dotted paths to every string in the dictionary, e.g. 'settings.language.title'. */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;

export type Params = Record<string, string | number>;

function lookup(dict: Messages, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Translate a key. `{name}` placeholders are filled from params. English plurals: if
 * `params.count` is given and a sibling key `<key>_one` exists, it is used when count === 1.
 */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const dict = dictionaries[locale];
  let s: string | undefined;
  if (params && typeof params.count === 'number' && params.count === 1) s = lookup(dict, `${key}_one`);
  s ??= lookup(dict, key) ?? lookup(dictionaries['zh-Hans'], key) ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : s;
}

/** Translate in the current language (non-React code: notices, notifications, errors). */
export const t = (key: MessageKey, params?: Params) => translate(current, key, params);

/** Translate in components; re-renders when the language changes. */
export function useT() {
  const locale = useLocale();
  return (key: MessageKey, params?: Params) => translate(locale, key, params);
}

/** Pick between inline strings (plugins' overlays, one-off copy) by the current language. */
export function pick<T>(byLocale: { 'zh-Hans': T; en?: T }, locale: Locale = current): T {
  return (locale === 'en' ? byLocale.en : undefined) ?? byLocale['zh-Hans'];
}
