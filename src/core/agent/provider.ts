import type { LanguageModel } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { useSyncExternalStore } from 'react';

import { pluginSettings } from '@/core/runtime/plugin-settings';
import { pluginName } from '@/core/runtime/localize';
import { registry, type ProviderEntry } from '@/core/runtime/registry';
import { kv } from '@/core/store/kv';
import { subscribeLocale, t } from '@/i18n';
import { secrets, type SecretKey } from '@/core/store/secrets';

/**
 * Active model provider (docs/ARCHITECTURE.md §5). Providers come from plugins
 * (`PluginDef.providers`); this store remembers which one is active and the base URL / model
 * chosen for each. Credentials live in SecureStore per provider.
 */

export const DEFAULT_PROVIDER = 'deepseek.api';

export type ProviderSettings = { baseURL: string; model: string };

/** What screens read. `name` and `model` describe the active provider. */
export type AIConfig = { providerId: string; name: string; baseURL: string; model: string };

type Saved = { active: string; providers: Record<string, ProviderSettings> };

const store = kv('ai');
const keyOf = (providerId: string) => `ai.${providerId}.apiKey` as SecretKey;

let saved: Saved = { active: DEFAULT_PROVIDER, providers: {} };
let keys: Record<string, boolean> = {};
const listeners = new Set<() => void>();
let snapshot = build();

function settingsFor(entry: ProviderEntry | undefined, providerId: string): ProviderSettings {
  const s = saved.providers[providerId];
  return {
    baseURL: s?.baseURL || entry?.def.defaultBaseURL || '',
    model: s?.model || entry?.def.defaultModel || '',
  };
}

function build() {
  const entry = registry.provider(saved.active);
  const s = settingsFor(entry, saved.active);
  const config: AIConfig = { providerId: saved.active, name: entry?.def.name ?? saved.active, ...s };
  // Ready to chat: no auth needed, a stored credential, or a custom endpoint (may be keyless,
  // e.g. a LAN server) the user has configured with a model.
  const hasCredential = !!keys[saved.active];
  const ready =
    !!entry && (entry.def.auth === 'none' || hasCredential || (!!entry.def.editableBaseURL && !!saved.providers[saved.active]?.model));
  return { config, hasKey: ready, hasCredential, provider: entry, keys };
}

const emit = () => {
  snapshot = build();
  listeners.forEach((l) => l());
};

/** One-time move from the single-provider config (v0) to per-provider settings. */
async function migrate() {
  const old = await store.get<{ baseURL: string; model: string }>('config');
  if (!old) return;
  const legacyKey = await secrets.get('ai.apiKey');
  const providerId = old.baseURL.includes('deepseek.com') ? 'deepseek.api' : 'openai-compatible.custom';
  // deepseek-v4-flash was renamed deepseek-flash (DeepSeek Harness catalog).
  const model = old.model === 'deepseek-v4-flash' ? 'deepseek-flash' : old.model;
  saved = { active: providerId, providers: { [providerId]: { baseURL: old.baseURL, model } } };
  await store.set('settings', saved);
  if (legacyKey) {
    await secrets.set(keyOf(providerId), legacyKey);
    await secrets.delete('ai.apiKey');
  }
  await store.delete('config');
}

export const aiConfig = {
  async load() {
    await migrate();
    saved = (await store.get<Saved>('settings')) ?? { active: DEFAULT_PROVIDER, providers: {} };
    keys = {};
    for (const p of registry.providers()) keys[p.id] = !!(await secrets.get(keyOf(p.id)));
    emit();
  },
  get: () => snapshot.config,
  settingsFor: (providerId: string) => settingsFor(registry.provider(providerId), providerId),
  hasCredential: (providerId: string) => !!keys[providerId],
  /** Save settings for a provider (and optionally make it active / set its credential). */
  async save(providerId: string, next: Partial<ProviderSettings>, opts: { credential?: string; activate?: boolean } = {}) {
    const cur = settingsFor(registry.provider(providerId), providerId);
    saved = {
      active: opts.activate === false ? saved.active : providerId,
      providers: { ...saved.providers, [providerId]: { ...cur, ...next } },
    };
    await store.set('settings', saved);
    if (opts.credential !== undefined) {
      if (opts.credential) await secrets.set(keyOf(providerId), opts.credential);
      else await secrets.delete(keyOf(providerId));
      keys = { ...keys, [providerId]: !!opts.credential };
    }
    emit();
  },
  async activate(providerId: string) {
    saved = { ...saved, active: providerId };
    await store.set('settings', saved);
    emit();
  },
  credential: (providerId: string) => secrets.get(keyOf(providerId)),
  subscribe(l: () => void) {
    listeners.add(l);
    // Providers appear when plugins register; keep the snapshot fresh. The provider's display
    // name is localized, so rebuild on language change too.
    const off = registry.subscribe(emit);
    const offLocale = subscribeLocale(emit);
    return () => {
      listeners.delete(l);
      off();
      offLocale();
    };
  },
  snapshot: () => snapshot,
};

export function useAIConfig() {
  return useSyncExternalStore(aiConfig.subscribe, aiConfig.snapshot);
}

/** Language model of a provider (default: the active one). Throws with a readable reason. */
export async function getModel(providerId = saved.active): Promise<LanguageModel> {
  const entry = registry.provider(providerId);
  if (!entry) throw new Error(t('chat.agent.providerMissing', { id: providerId }));
  if (!pluginSettings.get(entry.pluginId).enabled) {
    const plugin = registry.get(entry.pluginId);
    throw new Error(t('chat.agent.providerDisabled', { name: plugin ? pluginName(plugin) : entry.pluginId }));
  }
  const s = settingsFor(entry, providerId);
  if (!s.model) throw new Error(t('chat.agent.noModel'));
  const credential = (await secrets.get(keyOf(providerId))) ?? undefined;
  if (entry.def.auth === 'apiKey' && !credential && !entry.def.editableBaseURL) {
    throw new Error(t('chat.agent.noKey'));
  }
  if (entry.def.auth === 'account' && !credential) throw new Error(t('chat.agent.signIn', { name: entry.def.name }));
  return entry.def.createModel({ ...s, credential, fetch: expoFetch as unknown as typeof fetch }) as LanguageModel;
}
