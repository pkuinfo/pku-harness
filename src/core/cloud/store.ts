import {
  envelopeSchema,
  hkdfSha256,
  open,
  paths,
  seal,
  storeGetResponse,
  storeKeySchema,
  storeListResponse,
  storePutResponse,
  type RandomBytes,
} from '@pku-harness/cloud-protocol';
import { CloudError, isCloudError, type PluginCloud } from '@pku-harness/sdk';

import type { CloudClient } from './client';

/**
 * `cloud.store` for one plugin (docs/CLOUD.md §2.3, §2.7). The provider namespaces keys by the
 * token's (device, plugin). With `e2e` every value is sealed on the device under a per-plugin
 * key derived from the device's box key, bound to its key name (aad), so the server only ever
 * holds envelopes. Reads fall back to a local mirror when offline; writes need the network
 * (no silent outbox in v1).
 */

export interface MirrorKV {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface StoreDeps {
  client: CloudClient;
  pluginId: string;
  e2e: boolean;
  /** Device box secret key (seeds the per-plugin store key). */
  boxSecretKey(): Promise<Uint8Array>;
  rand: RandomBytes;
  mirror?: MirrorKV;
}

export const STORE_KDF_INFO = 'pku-harness-cloud/v1/store/';

export function storeKey(boxSecretKey: Uint8Array, pluginId: string): Uint8Array {
  return hkdfSha256(boxSecretKey, STORE_KDF_INFO + pluginId);
}

type Mirrored = { value: unknown; version: number };

export function createStore(deps: StoreDeps): PluginCloud['store'] {
  const auth = { plugin: deps.pluginId, services: ['store' as const] };
  const key = async () => storeKey(await deps.boxSecretKey(), deps.pluginId);
  const checkKey = (k: string) => {
    if (!storeKeySchema.safeParse(k).success) throw new CloudError('protocol', `invalid store key "${k}"`);
  };
  const decode = async (k: string, raw: unknown): Promise<unknown> => {
    if (!deps.e2e) return raw;
    const env = envelopeSchema.safeParse(raw);
    if (!env.success) throw new CloudError('protocol', 'stored value is not an envelope');
    try {
      return open(await key(), env.data, { aad: k });
    } catch {
      throw new CloudError('protocol', 'stored value could not be decrypted (identity was reset?)');
    }
  };

  return {
    async get<T>(k: string) {
      checkKey(k);
      try {
        const res = await deps.client.request({ method: 'GET', path: paths.storeKey(k), auth, schema: storeGetResponse });
        const value = (await decode(k, res.value)) as T;
        await deps.mirror?.set<Mirrored>(k, { value, version: res.version }).catch(() => {});
        return { value, version: res.version };
      } catch (e) {
        if (isCloudError(e, 'gone')) {
          await deps.mirror?.delete(k).catch(() => {});
          return undefined;
        }
        if (isCloudError(e, 'offline') && deps.mirror) {
          const local = await deps.mirror.get<Mirrored>(k);
          if (local) return { value: local.value as T, version: local.version };
        }
        throw e;
      }
    },
    async put<T>(k: string, value: T, opts?: { ifVersion?: number; ttlS?: number }) {
      checkKey(k);
      const wire = deps.e2e ? seal(await key(), value, { aad: k, rand: deps.rand }) : value;
      const res = await deps.client.request({
        method: 'PUT',
        path: paths.storeKey(k),
        auth,
        body: { value: wire, ...(opts?.ttlS ? { ttlS: opts.ttlS } : null) },
        headers: opts?.ifVersion !== undefined ? { 'if-match': String(opts.ifVersion) } : undefined,
        schema: storePutResponse,
      });
      await deps.mirror?.set<Mirrored>(k, { value, version: res.version }).catch(() => {});
      return { version: res.version };
    },
    async delete(k: string) {
      checkKey(k);
      try {
        await deps.client.request({ method: 'DELETE', path: paths.storeKey(k), auth });
      } catch (e) {
        if (!isCloudError(e, 'gone')) throw e;
      }
      await deps.mirror?.delete(k).catch(() => {});
    },
    async list(prefix?: string) {
      const items: { key: string; version: number; updatedAt: number }[] = [];
      let cursor: string | undefined;
      // Follow cursors (bounded: the per-plugin key quota is 1,000).
      for (let page = 0; page < 50; page++) {
        const path = paths.storeList(prefix) + (cursor ? `${prefix ? '&' : '?'}cursor=${encodeURIComponent(cursor)}` : '');
        const res = await deps.client.request({ method: 'GET', path, auth, schema: storeListResponse });
        items.push(...res.items);
        cursor = res.cursor;
        if (!cursor) break;
      }
      return items;
    },
  };
}
