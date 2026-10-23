import { useSyncExternalStore } from 'react';

import { pluginSettings } from '@/core/runtime/plugin-settings';

/**
 * Per-plugin cloud consent (docs/CLOUD.md §2.5). The grant lives with the plugin's other
 * settings (`PluginSettings.cloud`), so it shows and changes on the plugin's page. A bound client
 * that needs consent from an interactive caller queues a request; the root layout renders the
 * sheet (`CloudConsentPrompt`), like tool approvals.
 */

export function isCloudGranted(pluginId: string): boolean {
  return !!pluginSettings.get(pluginId).cloud?.granted;
}

const revokeHooks = new Set<(pluginId: string) => void>();

/** The runtime closes a plugin's channels when its consent is withdrawn. */
export function onCloudRevoked(fn: (pluginId: string) => void) {
  revokeHooks.add(fn);
  return () => void revokeHooks.delete(fn);
}

export async function setCloudGranted(pluginId: string, granted: boolean) {
  await pluginSettings.update(pluginId, { cloud: { granted, at: Date.now() } });
  if (!granted) revokeHooks.forEach((fn) => fn(pluginId));
}

export type ConsentRequest = { id: number; pluginId: string };

let queue: ConsentRequest[] = [];
const waiting = new Map<number, ((ok: boolean) => void)[]>();
const listeners = new Set<() => void>();
let nextId = 1;
const emit = () => listeners.forEach((l) => l());

/**
 * Ask the user to let `pluginId` use the cloud. Resolves true once allowed (also when it already
 * was). Concurrent requests for the same plugin share one sheet.
 */
export function requestCloudConsent(pluginId: string): Promise<boolean> {
  if (isCloudGranted(pluginId)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const pending = queue.find((r) => r.pluginId === pluginId);
    if (pending) {
      waiting.get(pending.id)!.push(resolve);
      return;
    }
    const id = nextId++;
    waiting.set(id, [resolve]);
    queue = [...queue, { id, pluginId }];
    emit();
  });
}

export const cloudConsent = {
  current: () => queue[0] ?? null,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  async answer(id: number, allow: boolean) {
    const req = queue.find((r) => r.id === id);
    if (!req) return;
    queue = queue.filter((r) => r.id !== id);
    emit();
    if (allow) await setCloudGranted(req.pluginId, true);
    waiting.get(id)?.forEach((r) => r(allow));
    waiting.delete(id);
  },
};

export function useCloudConsentRequest(): ConsentRequest | null {
  return useSyncExternalStore(cloudConsent.subscribe, cloudConsent.current);
}
