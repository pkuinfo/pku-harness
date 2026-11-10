import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { kv } from '@/core/store/kv';

import { isNewer, pickApk, type ReleaseAsset } from './version';

/**
 * New-APK check (docs/RELEASE.md): the app asks GitHub for the latest release and, when it is
 * newer than the installed version, offers that release's APK for this phone's CPU. JS-only
 * fixes reach phones by OTA instead (docs/OTA.md); this covers releases with native changes,
 * which OTA can't deliver. No server of ours is involved.
 */

const LATEST = 'https://api.github.com/repos/pkuinfo/pku-harness/releases/latest';
/** Automatic checks at most this often (an explicit check in Settings always runs). */
const CHECK_EVERY_MS = 12 * 60 * 60_000;
/** "Later" quiets the prompt for that version this long; Settings still shows it. */
const SNOOZE_MS = 3 * 24 * 60 * 60_000;

export type AppUpdate = { version: string; url: string; size: number; page: string };

let available: AppUpdate | null = null;
const listeners = new Set<() => void>();
const set = (u: AppUpdate | null) => {
  available = u;
  listeners.forEach((l) => l());
};

export const installedVersion = () => Application.nativeApplicationVersion ?? '0.0.0';

/** The newer release, or null when up to date. Throws on network errors. */
export async function fetchAppUpdate(): Promise<AppUpdate | null> {
  if (Platform.OS !== 'android') return null;
  const res = await fetch(LATEST, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const r = (await res.json()) as { tag_name?: string; html_url?: string; assets?: { name: string; browser_download_url: string; size: number }[] };
  const version = (r.tag_name ?? '').replace(/^v/, '');
  if (!isNewer(version, installedVersion())) {
    set(null);
    await kv('prefs').delete('update.latest');
    return null;
  }
  const assets: ReleaseAsset[] = (r.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size }));
  const apk = pickApk(assets, Device.supportedCpuArchitectures);
  const update = { version, url: apk?.url ?? r.html_url ?? '', size: apk?.size ?? 0, page: r.html_url ?? '' };
  set(update);
  await kv('prefs').set('update.latest', update);
  return update;
}

/**
 * The launch check: at most every 12 hours, quietly ignoring failures. Returns an update only
 * when the user should be prompted (not snoozed for that version).
 */
export async function checkOnLaunch(now = Date.now()): Promise<AppUpdate | null> {
  const prefs = kv('prefs');
  const last = (await prefs.get<number>('update.checkedAt')) ?? 0;
  if (now - last < CHECK_EVERY_MS) {
    // Between checks, Settings still shows the release the last check found (unless it is installed now).
    const known = await prefs.get<AppUpdate>('update.latest');
    if (known && isNewer(known.version, installedVersion())) set(known);
    return null;
  }
  const update = await fetchAppUpdate().catch(() => null);
  await prefs.set('update.checkedAt', now);
  if (!update) return null;
  const snooze = await prefs.get<{ version: string; until: number }>('update.snooze');
  return snooze?.version === update.version && now < snooze.until ? null : update;
}

export async function snooze(update: AppUpdate, now = Date.now()) {
  await kv('prefs').set('update.snooze', { version: update.version, until: now + SNOOZE_MS });
}

/** The newer release found by the last check (null when none / not checked). */
export function useAppUpdate(): AppUpdate | null {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => available,
  );
}
