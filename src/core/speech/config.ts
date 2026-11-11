import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry, type SpeechProviderEntry } from '@/core/runtime/registry';
import { kv } from '@/core/store/kv';
import { secrets, type SecretKey } from '@/core/store/secrets';
import { subscribeLocale, t } from '@/i18n';

/**
 * Voice input's speech-to-text service (bring your own key). Services come from plugins
 * (`PluginDef.speech`); this store remembers which one is active and its base URL / model. The
 * key lives in SecureStore. A recording goes from the phone straight to the service.
 */

export const DEFAULT_SPEECH_PROVIDER = 'speech.siliconflow';

export type SpeechSettings = { baseURL: string; model: string };
type Saved = { active: string; providers: Record<string, SpeechSettings> };

const store = kv('speech');
const keyOf = (providerId: string) => `ai.speech:${providerId}.apiKey` as SecretKey;

let saved: Saved = { active: DEFAULT_SPEECH_PROVIDER, providers: {} };
let keys: Record<string, boolean> = {};
let loaded = false;
const listeners = new Set<() => void>();

function settingsFor(entry: SpeechProviderEntry | undefined, providerId: string): SpeechSettings {
  const s = saved.providers[providerId];
  return { baseURL: s?.baseURL || entry?.def.defaultBaseURL || '', model: s?.model || entry?.def.defaultModel || '' };
}

function build() {
  const entry = registry.speechProvider(saved.active);
  const settings = settingsFor(entry, saved.active);
  // Ready: the service's plugin is on, it has a model, and a key (a custom endpoint may be keyless).
  const ready = !!entry && pluginSettings.get(entry.pluginId).enabled && !!settings.model && (!!keys[saved.active] || !!entry.def.editableBaseURL && !!saved.providers[saved.active]);
  return { providerId: saved.active, provider: entry, settings, ready, loaded, keys };
}

let snapshot = build();
const emit = () => {
  snapshot = build();
  listeners.forEach((l) => l());
};

export const speechConfig = {
  async load() {
    saved = (await store.get<Saved>('settings')) ?? saved;
    keys = {};
    for (const p of registry.speechProviders()) keys[p.id] = !!(await secrets.get(keyOf(p.id)));
    loaded = true;
    emit();
  },
  settingsFor: (providerId: string) => settingsFor(registry.speechProvider(providerId), providerId),
  hasCredential: (providerId: string) => !!keys[providerId],
  /** Save a service's settings (and its key when given) and make it the active one. */
  async save(providerId: string, next: Partial<SpeechSettings>, opts: { credential?: string } = {}) {
    const cur = settingsFor(registry.speechProvider(providerId), providerId);
    saved = { active: providerId, providers: { ...saved.providers, [providerId]: { ...cur, ...next } } };
    await store.set('settings', saved);
    if (opts.credential !== undefined) {
      if (opts.credential) await secrets.set(keyOf(providerId), opts.credential);
      else await secrets.delete(keyOf(providerId));
      keys = { ...keys, [providerId]: !!opts.credential };
    }
    emit();
  },
  credential: (providerId: string) => secrets.get(keyOf(providerId)),
  subscribe(l: () => void) {
    listeners.add(l);
    if (!loaded) void speechConfig.load();
    const off = registry.subscribe(emit);
    const offSettings = pluginSettings.subscribe(emit);
    const offLocale = subscribeLocale(emit);
    return () => {
      listeners.delete(l);
      off();
      offSettings();
      offLocale();
    };
  },
  snapshot: () => snapshot,
};

export function useSpeechConfig() {
  return useSyncExternalStore(speechConfig.subscribe, speechConfig.snapshot);
}

/** Transcribe a recording with the active service. Throws with a readable reason. */
export async function transcribe(audio: { uri: string; durationMs?: number }, signal?: AbortSignal): Promise<string> {
  if (!loaded) await speechConfig.load();
  const { provider, settings, providerId } = snapshot;
  if (!provider) throw new Error(t('chat.voice.notSetUp'));
  const credential = (await secrets.get(keyOf(providerId))) ?? undefined;
  if (!credential && !provider.def.editableBaseURL) throw new Error(t('chat.voice.noKey'));
  const name = audio.uri.split('/').pop() || 'voice.m4a';
  // expo/fetch uploads an expo-file-system File (a Blob) in a FormData; RN's { uri } parts it rejects.
  const file = new File(audio.uri) as unknown as Blob;
  return provider.def.transcribe(
    { ...settings, credential, fetch: expoFetch as unknown as typeof fetch },
    { file, uri: audio.uri, name, mimeType: name.endsWith('.3gp') ? 'audio/3gpp' : name.endsWith('.wav') ? 'audio/wav' : 'audio/mp4', durationMs: audio.durationMs },
    signal,
  );
}
