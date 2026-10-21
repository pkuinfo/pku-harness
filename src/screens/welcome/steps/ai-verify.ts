import { fetch as expoFetch } from 'expo/fetch';

import type { ProviderEntry } from '@/core/runtime/registry';
import type { ProviderModel } from '@/core/runtime/types';
import { t } from '@/i18n';

const TIMEOUT_MS = 15_000;

/**
 * Check a provider credential the cheapest way: list its models (one GET), or, for providers
 * without a listing, one tiny completion. Resolves with the listed models (may be empty).
 * The key is only sent to the provider's own endpoint and never logged.
 */
export async function verifyProvider(entry: ProviderEntry, baseURL: string, model: string, credential: string | undefined): Promise<ProviderModel[]> {
  const config = { baseURL, model, credential, fetch: expoFetch as unknown as typeof fetch };
  const run = async () => {
    if (entry.def.listModels) return entry.def.listModels(config);
    const { generateText } = await import('ai');
    await generateText({ model: entry.def.createModel(config) as Parameters<typeof generateText>[0]['model'], prompt: t('welcome.ai.testPrompt'), maxOutputTokens: 8 });
    return [];
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
