/**
 * Test-only translator over the real dictionaries, without importing '@/i18n' (which pulls in
 * react-native and expo-localization). Same rules as translate(): `{name}` params and `_one`.
 */
import { en } from '@/i18n/messages/en';
import { zhHans } from '@/i18n/messages/zh-Hans';
import type { Locale, MessageKey, Params } from '@/i18n';

const dicts = { 'zh-Hans': zhHans, en } as const;

function lookup(dict: unknown, key: string): string | undefined {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function makeTr(locale: Locale) {
  return (key: MessageKey, params?: Params): string => {
    let s = params?.count === 1 ? lookup(dicts[locale], `${key}_one`) : undefined;
    s ??= lookup(dicts[locale], key);
    if (s == null) throw new Error(`missing ${locale} string ${key}`);
    return params ? s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : s;
  };
}
