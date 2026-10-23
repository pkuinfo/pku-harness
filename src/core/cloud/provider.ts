import { metaResponse, paths, PROTOCOL_VERSION, type MetaResponse } from '@pku-harness/cloud-protocol';
import { CloudError } from '@pku-harness/sdk';
import { fetch as expoFetch } from 'expo/fetch';
import { useSyncExternalStore } from 'react';

import { setDynamicCapability } from '@/core/runtime/capabilities';
import { kv } from '@/core/store/kv';

import { toCloudError, type FetchLike } from './client';
import { DEFAULT_PROVIDER_CONFIG, checkBaseURL, resolveBaseURL, type ProviderConfig } from './config';

/**
 * Which cloud provider the user chose (docs/CLOUD.md §2.4): off (default), official, or a
 * self-hosted / BYO base URL. Persisted in kv `cloud`; `/v1/meta` is cached per base URL so the
 * settings screen and `available` work offline. Drives the reactive `'cloud'` capability.
 */

export type ProviderState = {
  config: ProviderConfig;
  /** Base URL in effect (undefined when off or the custom URL is invalid). */
  baseURL?: string;
  meta?: MetaResponse;
  /** Last request to the provider got an answer. */
  online: boolean;
};

const store = kv('cloud');
export const fetchImpl = expoFetch as unknown as FetchLike;

let state: ProviderState = { config: DEFAULT_PROVIDER_CONFIG, online: false };
const listeners = new Set<() => void>();

function set(next: ProviderState) {
  state = next;
  setDynamicCapability('cloud', !!next.baseURL);
  listeners.forEach((l) => l());
}

const metaKey = (baseURL: string) => `meta:${baseURL}`;

/** GET /v1/meta from any base URL (connection test). Throws CloudError. */
export async function fetchMeta(baseURL: string, signal?: AbortSignal): Promise<MetaResponse> {
  let res: Awaited<ReturnType<FetchLike>>;
  let text: string;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    res = await fetchImpl(baseURL + paths.meta(), { method: 'GET', headers: { accept: 'application/json' }, signal: ctrl.signal });
    text = await res.text();
  } catch (e) {
    throw new CloudError('offline', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
  if (res.status < 200 || res.status >= 300) throw toCloudError(res.status, text, res.headers);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CloudError('protocol', 'not a PKU Harness Cloud server (response is not JSON)');
  }
  if ((json as { protocol?: unknown })?.protocol !== PROTOCOL_VERSION) throw new CloudError('protocol', `unsupported protocol ${(json as { protocol?: unknown })?.protocol ?? '?'}`);
  const r = metaResponse.safeParse(json);
  if (!r.success) throw new CloudError('protocol', `invalid /v1/meta: ${r.error.issues[0]?.message ?? ''}`);
  return r.data;
}

export const cloudProvider = {
  get: () => state,
  async load() {
    const config = (await store.get<ProviderConfig>('provider')) ?? DEFAULT_PROVIDER_CONFIG;
    const baseURL = resolveBaseURL(config, { dev: __DEV__ });
    const meta = baseURL ? await store.get<MetaResponse>(metaKey(baseURL)) : undefined;
    set({ config, baseURL, meta, online: false });
  },
  async save(config: ProviderConfig) {
    const baseURL = resolveBaseURL(config, { dev: __DEV__ });
    if (config.mode === 'custom' && !baseURL) throw new CloudError('not_configured', 'invalid base URL');
    await store.set('provider', config);
    const meta = baseURL ? await store.get<MetaResponse>(metaKey(baseURL)) : undefined;
    set({ config, baseURL, meta, online: baseURL === state.baseURL ? state.online : false });
  },
  /** Re-read /v1/meta for the current provider; marks online/offline. */
  async refreshMeta(): Promise<MetaResponse | undefined> {
    const baseURL = state.baseURL;
    if (!baseURL) return undefined;
    try {
      const meta = await fetchMeta(baseURL);
      await store.set(metaKey(baseURL), meta);
      if (state.baseURL === baseURL) set({ ...state, meta, online: true });
      return meta;
    } catch (e) {
      if (state.baseURL === baseURL) set({ ...state, online: !(e instanceof CloudError && e.code === 'offline') && state.online });
      throw e;
    }
  },
  /** Meta for the current provider: cached, else fetched. */
  async meta(): Promise<MetaResponse> {
    if (state.meta) return state.meta;
    const m = await this.refreshMeta();
    if (!m) throw new CloudError('not_configured', 'no cloud provider');
    return m;
  },
  setOnline(online: boolean) {
    if (state.online !== online && state.baseURL) set({ ...state, online });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

export function useCloudProvider(): ProviderState {
  return useSyncExternalStore(cloudProvider.subscribe, cloudProvider.get);
}

export { checkBaseURL };
