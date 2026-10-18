import { registry as registrySchema, type Registry, type RegistryEntry } from '@pku-harness/registry';
import { fetch as expoFetch } from 'expo/fetch';

import { kv } from '@/core/store/kv';

/**
 * The marketplace index lives in pkuinfo/pku-harness-plugins (registry/registry.json). Fetched
 * from GitHub raw with a jsDelivr mirror (raw.githubusercontent.com is often unreachable in
 * mainland China), validated with the shared schema, cached for offline use.
 */
const SOURCES = [
  'https://cdn.jsdelivr.net/gh/pkuinfo/pku-harness-plugins@main/registry/registry.json',
  'https://raw.githubusercontent.com/pkuinfo/pku-harness-plugins/main/registry/registry.json',
];

const store = kv('marketplace');

export type MarketState = { registry: Registry; fetchedAt: number; stale: boolean };

async function fetchOne(url: string): Promise<Registry> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await expoFetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return registrySchema.parse(await res.json());
  } finally {
    clearTimeout(t);
  }
}

export async function loadMarketplace(force = false): Promise<MarketState> {
  const cached = await store.get<{ registry: Registry; fetchedAt: number }>('registry');
  if (cached && !force && Date.now() - cached.fetchedAt < 6 * 3600_000) return { ...cached, stale: false };
  for (const url of SOURCES) {
    try {
      const registry = await fetchOne(url);
      const state = { registry, fetchedAt: Date.now() };
      await store.set('registry', state);
      return { ...state, stale: false };
    } catch {
      // try the next mirror
    }
  }
  if (cached) return { ...cached, stale: true };
  throw new Error('无法连接插件市场，请检查网络后重试');
}

export type { RegistryEntry };
