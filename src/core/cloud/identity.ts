import { boxPublicKey, fromB64url, generateDeviceIdentity, sha256, signPublicKey, toB64url, toHex } from '@pku-harness/cloud-protocol';

import { kv } from '@/core/store/kv';
import { secrets } from '@/core/store/secrets';

import type { ClientIdentity } from './client';
import { rand } from './crypto';

/**
 * This device's cloud identity (docs/CLOUD.md §2.1): an Ed25519 signing key and an X25519 box
 * key, nothing campus-related. The secret keys live only in SecureStore (`cloud.identity`,
 * AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY via `secrets`: never in backups, never on another phone).
 * The provider-assigned device id is per provider and not secret (kv).
 */

const SECRET = 'cloud.identity' as const;
const store = kv('cloud');

export interface Identity extends ClientIdentity {
  boxSecretKey: Uint8Array;
}

let cached: Promise<Identity> | null = null;

function fromStored(json: string): Identity | null {
  try {
    const v = JSON.parse(json) as { v: 1; sign: string; box: string };
    if (v.v !== 1) return null;
    const signSecretKey = fromB64url(v.sign);
    const boxSecretKey = fromB64url(v.box);
    if (signSecretKey.length !== 32 || boxSecretKey.length !== 32) return null;
    return { signSecretKey, boxSecretKey, signPub: toB64url(signPublicKey(signSecretKey)), boxPub: toB64url(boxPublicKey(boxSecretKey)) };
  } catch {
    return null;
  }
}

/** Load the identity, creating it on first use. */
export function identity(): Promise<Identity> {
  cached ??= (async () => {
    const stored = await secrets.get(SECRET);
    const existing = stored ? fromStored(stored) : null;
    if (existing) return existing;
    const id = generateDeviceIdentity(rand);
    await secrets.set(SECRET, JSON.stringify({ v: 1, sign: toB64url(id.sign.secretKey), box: toB64url(id.box.secretKey) }));
    return { signSecretKey: id.sign.secretKey, boxSecretKey: id.box.secretKey, signPub: toB64url(id.sign.publicKey), boxPub: toB64url(id.box.publicKey) };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

/** True when an identity already exists (without creating one). */
export async function hasIdentity(): Promise<boolean> {
  return !!(await secrets.get(SECRET));
}

/**
 * Human-checkable fingerprint: the first 8 16-bit words of sha256(signPub), as hex groups
 * (`3f2a 91c0 …`). Same device = same fingerprint at every provider.
 */
export function fingerprint(signPub: string): string {
  const hex = toHex(sha256(fromB64url(signPub)).slice(0, 16));
  return hex.match(/.{4}/g)!.join(' ');
}

type DeviceIds = Record<string, string>;

/** The device id this identity got from a provider (keyed by base URL). */
export const deviceIds = {
  async get(baseURL: string): Promise<string | undefined> {
    return (await store.get<DeviceIds>('devices'))?.[baseURL];
  },
  async set(baseURL: string, id: string | undefined) {
    const all = { ...(await store.get<DeviceIds>('devices')) };
    if (id) all[baseURL] = id;
    else delete all[baseURL];
    await store.set('devices', all);
  },
  async clear() {
    await store.delete('devices');
  },
};

/** Forget the keys and every device id: the next use creates a fresh identity. */
export async function resetIdentity() {
  cached = null;
  await secrets.delete(SECRET);
  await deviceIds.clear();
}
