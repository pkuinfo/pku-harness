import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { fetch as expoFetch } from 'expo/fetch';
import { useSyncExternalStore } from 'react';

import { kv } from '@/core/store/kv';
import { secrets } from '@/core/store/secrets';

export type AIConfig = {
  /** OpenAI-compatible base URL. */
  baseURL: string;
  model: string;
  /** Display name of the provider. */
  name: string;
};

/** DeepSeek is the default provider (model ids as used by DeepSeek Harness). */
export const PRESETS: Record<string, AIConfig & { models: string[] }> = {
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
};

const DEFAULT: AIConfig = { ...PRESETS.deepseek };
const store = kv('ai');
let config: AIConfig = DEFAULT;
let hasKey = false;
const listeners = new Set<() => void>();
let snapshot = { config, hasKey };
const emit = () => {
  snapshot = { config, hasKey };
  listeners.forEach((l) => l());
};

export const aiConfig = {
  async load() {
    config = { ...DEFAULT, ...(await store.get<AIConfig>('config')) };
    hasKey = !!(await secrets.get('ai.apiKey'));
    emit();
  },
  get: () => config,
  async save(next: Partial<AIConfig>, apiKey?: string) {
    config = { ...config, ...next };
    await store.set('config', config);
    if (apiKey !== undefined) {
      if (apiKey) await secrets.set('ai.apiKey', apiKey);
      else await secrets.delete('ai.apiKey');
      hasKey = !!apiKey;
    }
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => snapshot,
};

export function useAIConfig() {
  return useSyncExternalStore(aiConfig.subscribe, aiConfig.snapshot);
}

/** Build the language model for the current config. Throws if no API key is set. */
export async function getModel() {
  const apiKey = await secrets.get('ai.apiKey');
  if (!apiKey) throw new Error('还没有设置 AI 服务的 API Key（设置 → AI 服务）');
  const provider = createOpenAICompatible({
    name: config.name.toLowerCase(),
    baseURL: config.baseURL,
    apiKey,
    fetch: expoFetch as unknown as typeof fetch,
    includeUsage: true,
  });
  return provider.chatModel(config.model);
}
