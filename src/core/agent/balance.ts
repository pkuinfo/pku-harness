/**
 * Account balance of an AI provider that can report one (`ProviderDef.balance`, e.g. DeepSeek
 * GET /user/balance), read with the user's own key from secure storage. Only providers with a
 * stored credential are queried; nothing goes over the network otherwise. The key is handed to
 * the provider plugin and never kept, logged or surfaced here.
 */
import type { ProviderAccount } from '@pku-harness/sdk';
import { fetch as expoFetch } from 'expo/fetch';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { aiConfig, useAIConfig } from '@/core/agent/provider';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';

export type BalanceState =
  | { kind: 'unsupported' }
  | { kind: 'loading' }
  /** `refreshing`: a newer reading is on its way; keep showing this one meanwhile. */
  | { kind: 'ready'; account: ProviderAccount; at: number; refreshing?: boolean }
  | { kind: 'error'; message: string };

/** A reading younger than this is reused instead of asking the provider again. */
const FRESH_MS = 60_000;
const TIMEOUT_MS = 15_000;

const UNSUPPORTED: BalanceState = { kind: 'unsupported' };
const LOADING: BalanceState = { kind: 'loading' };

/** Cache key = provider + endpoint, so a changed base URL never shows another account's money. */
const states = new Map<string, BalanceState>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const cacheKey = (providerId: string, baseURL: string) => `${providerId}|${baseURL}`;

function set(key: string, state: BalanceState) {
  states.set(key, state);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Whether a provider can and may be asked for its balance (plugin on, `balance`, stored key). */
export function balanceSupported(providerId: string): boolean {
  const entry = registry.provider(providerId);
  return !!entry?.def.balance && aiConfig.hasCredential(providerId) && pluginSettings.get(entry.pluginId).enabled;
}

/** The host's fetch with a timeout, so a stalled request ends in an error instead of a skeleton. */
const timedFetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return (expoFetch as unknown as typeof fetch)(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}) as typeof fetch;

async function load(providerId: string, force: boolean): Promise<void> {
  const entry = registry.provider(providerId);
  if (!entry?.def.balance || !balanceSupported(providerId)) return;
  const settings = aiConfig.settingsFor(providerId);
  const key = cacheKey(providerId, settings.baseURL);
  const cur = states.get(key);
  if (!force && cur?.kind === 'ready' && Date.now() - cur.at < FRESH_MS) return;
  const pending = inflight.get(key);
  if (pending) return pending;

  set(key, cur?.kind === 'ready' ? { ...cur, refreshing: true } : LOADING);
  const balance = entry.def.balance;
  const run = (async () => {
    try {
      const credential = (await aiConfig.credential(providerId)) ?? undefined;
      if (!credential) {
        states.delete(key);
        return;
      }
      const account = await balance({ ...settings, credential, fetch: timedFetch });
      set(key, { kind: 'ready', account, at: Date.now() });
    } catch (e) {
      set(key, { kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

/** Balance of a provider (default: the active one); cached for a minute, refreshes on demand. */
export function useProviderBalance(providerId?: string): { state: BalanceState; refresh: () => void } {
  // Re-render on credential / endpoint / plugin changes (the snapshot rebuilds on each).
  const { config, keys } = useAIConfig();
  const id = providerId ?? config.providerId;
  const enabled = usePluginSettings(registry.provider(id)?.pluginId ?? '').enabled;
  const supported = enabled && balanceSupported(id) && !!keys[id];
  const baseURL = aiConfig.settingsFor(id).baseURL;
  const key = cacheKey(id, baseURL);

  const state = useSyncExternalStore(subscribe, () => (supported ? (states.get(key) ?? LOADING) : UNSUPPORTED));

  useEffect(() => {
    if (supported) void load(id, false);
  }, [id, key, supported]);

  const refresh = useCallback(() => {
    if (supported) void load(id, true);
  }, [id, supported]);

  return { state, refresh };
}

/** Forget cached readings (e.g. after the key changed) and read them again from the provider. */
export function invalidateBalance(providerId?: string) {
  const dropped = new Set<string>();
  for (const k of [...states.keys()]) {
    if (providerId && !k.startsWith(`${providerId}|`)) continue;
    states.delete(k);
    dropped.add(k.slice(0, k.indexOf('|')));
  }
  listeners.forEach((l) => l());
  // Screens showing these balances now read "loading"; fetch again (no-op if unsupported).
  for (const id of dropped) void load(id, true);
}
