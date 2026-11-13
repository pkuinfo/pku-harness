import { Directory, File, Paths } from 'expo-file-system';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';

import { t } from '@/i18n';
import AppUpdater, { type UpdateDownload } from '../../../modules/app-updater';

import { installedVersion, type AppUpdate } from './app-update';
import { isNewer } from './version';

/**
 * In-app APK update. The download runs in Android's DownloadManager (modules/app-updater): it
 * keeps going in the background and with the screen off, shows its progress in the system
 * notification, and the app posts "Tap to install" when it finishes, so the update sheet can close
 * as soon as the user taps Download. Installing hands the APK to Android's package installer,
 * which keeps all data and checks that it is signed with the same key as this app. The first
 * time, Android asks the user to allow PKU harness to install apps (a one-time switch).
 */

export type InstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; written: number; total: number; waitingForNetwork: boolean }
  | { phase: 'ready'; version: string }
  | { phase: 'failed'; version: string; reason: string };

let state: InstallState = { phase: 'idle' };
const listeners = new Set<() => void>();
const set = (s: InstallState) => {
  state = s;
  listeners.forEach((l) => l());
};

function fromNative(d: UpdateDownload): InstallState {
  switch (d.status) {
    case 'pending':
    case 'running':
    case 'paused':
      return { phase: 'downloading', version: d.version, written: d.written, total: d.total, waitingForNetwork: d.waitingForNetwork };
    case 'done':
      return { phase: 'ready', version: d.version };
    case 'failed':
      return { phase: 'failed', version: d.version, reason: d.reason };
    default:
      return { phase: 'idle' };
  }
}

// While the app is open, follow a running download (the event covers its end even when closed).
let poll: ReturnType<typeof setInterval> | null = null;
function follow() {
  if (poll || !AppUpdater) return;
  poll = setInterval(() => void sync(), 1000);
}
export async function sync() {
  if (!AppUpdater) return;
  const next = fromNative(await AppUpdater.status());
  // A download of a version that is installed now is done with.
  set(next.phase !== 'idle' && !isNewer(next.version, installedVersion()) ? { phase: 'idle' } : next);
  if (state.phase !== 'downloading' && poll) {
    clearInterval(poll);
    poll = null;
  } else if (state.phase === 'downloading') follow();
}
AppUpdater?.addListener('onDownloadChange', (d) => set(fromNative(d)));
AppState.addEventListener('change', (s) => {
  if (s === 'active') void sync();
});

/**
 * Download the update in the background (`wifiOnly`: wait for an unmetered network). When it is
 * already downloaded, open the installer instead.
 */
export async function installUpdate(update: AppUpdate, opts: { wifiOnly?: boolean } = {}) {
  if (!AppUpdater) return;
  await sync();
  if (state.phase === 'ready' && state.version === update.version) return void (await AppUpdater.install());
  try {
    const d = await AppUpdater.download({
      url: update.url,
      version: update.version,
      size: update.size,
      title: t('app.settings.updateSheetTitle', { version: update.version }),
      description: t('app.settings.updateNotifDownloading'),
      wifiOnly: !!opts.wifiOnly,
      readyTitle: t('app.settings.updateNotifReadyTitle', { version: update.version }),
      readyText: t('app.settings.updateNotifReadyText'),
      channelName: t('app.settings.updateNotifChannel'),
    });
    set(fromNative(d));
    follow();
  } catch (e) {
    set({ phase: 'failed', version: update.version, reason: e instanceof Error ? e.message : String(e) });
  }
}

/** Open the installer for the downloaded update; false (state re-read) when the file is gone. */
export async function installDownloaded(): Promise<boolean> {
  if (await AppUpdater?.install()) return true;
  await sync();
  return false;
}

export function cancelInstall() {
  void AppUpdater?.cancel();
  set({ phase: 'idle' });
}

/** Forget downloads of versions that are installed now (and older in-cache APKs). Once per launch. */
export function cleanUpdateDownloads() {
  void AppUpdater?.clean(installedVersion()).then(sync);
  try {
    // Before 1.0.24 the APK was downloaded into the cache.
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && /^pku-harness-.+\.apk$/.test(entry.name)) entry.delete();
    }
  } catch {
    // The cache is the system's to clear; a leftover file does no harm.
  }
}

export const installState = () => state;

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}
