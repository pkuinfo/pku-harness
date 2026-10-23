import type { CloudServiceName } from '@pku-harness/cloud-protocol';
import { isCloudError, type CloudManifest, type PluginCloud } from '@pku-harness/sdk';
import { requireOptionalNativeModule } from 'expo';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { pluginName } from '@/core/runtime/localize';
import { registry } from '@/core/runtime/registry';
import { kv } from '@/core/store/kv';
import { secrets } from '@/core/store/secrets';
import { t } from '@/i18n';

import { setBindDeps } from './bind';
import { ChannelManager, type ChannelIndexEntry, type ChannelSecret, type SocketLike } from './channels';
import { CloudClient } from './client';
import { isCloudGranted, onCloudRevoked, requestCloudConsent } from './consent';
import { rand } from './crypto';
import { deviceIds, fingerprint, hasIdentity, identity, resetIdentity } from './identity';
import { cloudProvider, fetchImpl } from './provider';
import { createStore } from './store';

/**
 * The cloud runtime: one client and channel manager for the provider in effect, rebuilt when
 * the user switches; device registration in the background; reconnects on foreground and
 * network changes; and the dependencies `cloudFor()` binds plugins with (docs/CLOUD.md §3.2).
 */

const index = kv('cloud');
const channelSecretKey = (id: string) => `cloud.channel.${id}` as const;

let client: CloudClient | null = null;
let channels: ChannelManager | null = null;
const stores = new Map<string, PluginCloud['store']>();

// --- device status (settings screen) --------------------------------------------------------

export type DeviceStatus = { state: 'none' | 'registering' | 'registered' | 'error'; fingerprint?: string; error?: string };

let device: DeviceStatus = { state: 'none' };
const deviceListeners = new Set<() => void>();
function setDevice(next: DeviceStatus) {
  device = next;
  deviceListeners.forEach((l) => l());
}

export function useCloudDevice(): DeviceStatus {
  return useSyncExternalStore(
    (l) => {
      deviceListeners.add(l);
      return () => void deviceListeners.delete(l);
    },
    () => device,
  );
}

async function refreshDeviceStatus(state?: DeviceStatus['state'], error?: string) {
  const fp = (await hasIdentity()) ? fingerprint((await identity()).signPub) : undefined;
  const baseURL = cloudProvider.get().baseURL;
  const registered = baseURL ? !!(await deviceIds.get(baseURL)) : false;
  setDevice({ state: state ?? (registered ? 'registered' : 'none'), fingerprint: fp, error });
}

// --- wiring -----------------------------------------------------------------------------------

function makeSocket(url: string, headers: Record<string, string>): SocketLike {
  // React Native's WebSocket takes headers as a third argument (Libraries/WebSocket/WebSocket.js).
  const WS = WebSocket as unknown as new (url: string, protocols: string[] | undefined, options: { headers: Record<string, string> }) => SocketLike;
  return new WS(url, undefined, { headers });
}

function build(baseURL: string | undefined) {
  if (client?.baseURL === baseURL) return;
  // Switching providers ends shares on the old one (best effort; their TTL ends them anyway).
  const old = channels;
  if (old) void Promise.all(old.all().map((c) => c.close().catch(() => c.dispose())));
  stores.clear();
  client = null;
  channels = null;
  if (!baseURL) return;
  const c = new CloudClient({
    baseURL,
    fetch: fetchImpl,
    rand,
    identity,
    deviceId: { get: () => deviceIds.get(baseURL), set: (id) => deviceIds.set(baseURL, id) },
    meta: () => cloudProvider.meta(),
    onReachability: (ok) => cloudProvider.setOnline(ok),
  });
  client = c;
  channels = new ChannelManager({
    client: c,
    rand,
    socket: makeSocket,
    frameBytes: () => cloudProvider.get().meta?.limits.channels.frameBytes ?? 4096,
    onError: (e) => console.warn('cloud channel listener failed', e),
    persist: {
      saveSecret: (s) => secrets.set(channelSecretKey(s.id), JSON.stringify(s)),
      loadSecret: async (id) => {
        const raw = await secrets.get(channelSecretKey(id));
        return raw ? (JSON.parse(raw) as ChannelSecret) : undefined;
      },
      deleteSecret: (id) => secrets.delete(channelSecretKey(id)),
      loadIndex: async () => (await index.get<ChannelIndexEntry[]>('channels')) ?? [],
      saveIndex: (entries) => index.set('channels', entries),
    },
  });
  void channels.load().catch((e) => console.warn('cloud channels failed to load', e));
}

let registrationTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Register this device with the provider off the critical path: a short delay after boot or
 * after the user picks a provider, then the chunked proof of work (yields to the UI).
 */
export function scheduleRegistration(delayMs = 2500) {
  if (registrationTimer) clearTimeout(registrationTimer);
  registrationTimer = setTimeout(() => {
    registrationTimer = null;
    void registerNow().catch(() => {});
  }, delayMs);
}

export async function registerNow(): Promise<void> {
  const c = client;
  if (!c) return;
  setDevice({ ...device, state: 'registering', error: undefined });
  try {
    await c.ensureDevice();
    await refreshDeviceStatus('registered');
  } catch (e) {
    await refreshDeviceStatus('error', e instanceof Error ? e.message : String(e));
    throw e;
  }
}

let lastForeground = 0;

function onForeground() {
  if (!client) return;
  channels?.nudge();
  // Re-read meta at most every 10 minutes (operator, limits, pow salt).
  if (Date.now() - lastForeground > 10 * 60_000) {
    lastForeground = Date.now();
    void cloudProvider.refreshMeta().catch(() => {});
  }
}

function watchNetwork() {
  // expo-network is optional at runtime: dev clients built before it was added lack the module.
  if (!requireOptionalNativeModule('ExpoNetwork')) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Network = require('expo-network') as typeof import('expo-network');
  let wasConnected = true;
  Network.addNetworkStateListener((s) => {
    const connected = s.isConnected !== false;
    if (connected && !wasConnected) channels?.nudge();
    wasConnected = connected;
  });
}

let started: Promise<void> | null = null;

/** Boot the cloud runtime (idempotent). Cheap: no network until something needs it. */
export function initCloud(): Promise<void> {
  started ??= (async () => {
    await cloudProvider.load();
    setBindDeps({
      manifest: (id) => registry.get(id)?.cloud,
      provider: () => {
        const s = cloudProvider.get();
        return { mode: s.config.mode, baseURL: s.baseURL, meta: s.meta, online: s.online };
      },
      consent: { granted: isCloudGranted, request: requestCloudConsent },
      store: (pluginId: string, manifest: CloudManifest) => {
        const key = `${pluginId}|${manifest.e2e}`;
        let s = stores.get(key);
        if (!s) {
          if (!client) throw new Error('no cloud client');
          s = createStore({ client, pluginId, e2e: manifest.e2e, boxSecretKey: async () => (await identity()).boxSecretKey, rand, mirror: kv(`cloud-mirror:${pluginId}`) });
          stores.set(key, s);
        }
        return s;
      },
      channels: () => channels ?? undefined,
      message: (key, vars) => {
        const p = registry.get(vars.plugin);
        return t(`app.cloud.errors.${key}`, { plugin: p ? pluginName(p) : vars.plugin, service: vars.service ?? '' });
      },
    });
    build(cloudProvider.get().baseURL);
    cloudProvider.subscribe(() => {
      const next = cloudProvider.get().baseURL;
      if (next !== client?.baseURL) {
        build(next);
        void refreshDeviceStatus();
        if (next) scheduleRegistration(500);
      }
    });
    onCloudRevoked((pluginId) => void channels?.closePlugin(pluginId));
    AppState.addEventListener('change', (s) => {
      if (s === 'active') onForeground();
    });
    watchNetwork();
    void refreshDeviceStatus();
    if (client) {
      scheduleRegistration();
      void cloudProvider.refreshMeta().catch(() => {});
    }
  })();
  return started;
}

/** Services the provider offers (for device-level tokens). */
function providerServices(): CloudServiceName[] {
  const services = cloudProvider.get().meta?.services ?? [];
  return services.length ? services : ['store'];
}

/**
 * Delete everything this device stored at the current provider (DELETE /v1/devices/me) and
 * forget its channels. The identity stays; the next use registers again.
 */
export async function deleteCloudData(): Promise<void> {
  const c = client;
  if (!c) return;
  try {
    await c.deleteDevice(providerServices());
  } catch (e) {
    // The provider already forgot us: same outcome.
    if (!isCloudError(e, 'gone')) throw e;
    await deviceIds.set(c.baseURL, undefined);
  }
  channels?.disposeAll();
  await refreshDeviceStatus();
}

/** New keys: wipe this device's data at the provider (best effort), then a fresh identity. */
export async function resetCloudIdentity(): Promise<void> {
  await deleteCloudData().catch(() => {});
  channels?.disposeAll();
  await resetIdentity();
  client?.forgetTokens();
  await refreshDeviceStatus();
  if (client) scheduleRegistration(500);
}

/** Remove one plugin's data at the provider: its store keys and its channels. */
export async function clearPluginCloudData(pluginId: string): Promise<void> {
  const manifest = registry.get(pluginId)?.cloud;
  if (!manifest || !client) return;
  await channels?.closePlugin(pluginId);
  const supported = cloudProvider.get().meta?.services ?? manifest.uses;
  if (manifest.uses.includes('store') && supported.includes('store')) {
    const s = createStore({ client, pluginId, e2e: manifest.e2e, boxSecretKey: async () => (await identity()).boxSecretKey, rand, mirror: kv(`cloud-mirror:${pluginId}`) });
    for (const item of await s.list()) await s.delete(item.key);
  }
}

/** Full local reset (Settings → 清除所有数据): wipe at the provider first, then all keys. */
export async function wipeCloud(): Promise<void> {
  await deleteCloudData().catch(() => {});
  channels?.disposeAll();
  for (const e of (await index.get<ChannelIndexEntry[]>('channels')) ?? []) await secrets.delete(channelSecretKey(e.id)).catch(() => {});
  await resetIdentity();
  client?.forgetTokens();
}
