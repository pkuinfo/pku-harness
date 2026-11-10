import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSyncExternalStore } from 'react';

import { installedVersion, type AppUpdate } from './app-update';
import { isNewer } from './version';

/**
 * In-app APK update: download the release APK into the cache, then hand it to Android's package
 * installer, which installs it over this app and keeps all data. Android itself checks that the
 * APK is signed with the same key as the installed app, so a tampered download can't replace it.
 * The first time, Android asks the user to allow PKU Harness to install apps (a one-time switch).
 */

export type InstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; written: number; total: number }
  | { phase: 'failed'; version: string; reason: string };

let state: InstallState = { phase: 'idle' };
let abort: AbortController | null = null;
const listeners = new Set<() => void>();
const set = (s: InstallState) => {
  state = s;
  listeners.forEach((l) => l());
};

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_MIME = 'application/vnd.android.package-archive';
const NAME = /^pku-harness-(.+)\.apk$/;

const apkFile = (version: string) => new File(Paths.cache, `pku-harness-${version}.apk`);

/** Download (or reuse a complete earlier download of) the update, then open the installer. */
export async function installUpdate(update: AppUpdate) {
  if (state.phase === 'downloading') return;
  const file = apkFile(update.version);
  try {
    if (!(file.exists && update.size > 0 && file.size === update.size)) {
      if (file.exists) file.delete();
      abort = new AbortController();
      set({ phase: 'downloading', version: update.version, written: 0, total: update.size });
      await File.downloadFileAsync(update.url, file, {
        idempotent: true,
        signal: abort.signal,
        onProgress: ({ bytesWritten, totalBytes }) =>
          set({ phase: 'downloading', version: update.version, written: bytesWritten, total: totalBytes > 0 ? totalBytes : update.size }),
      });
      if (update.size > 0 && file.size !== update.size) throw new Error('incomplete download');
    }
    set({ phase: 'idle' });
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: file.contentUri, type: APK_MIME, flags: FLAG_GRANT_READ_URI_PERMISSION });
  } catch (e) {
    const cancelled = abort?.signal.aborted;
    if (file.exists && cancelled) file.delete();
    set(cancelled ? { phase: 'idle' } : { phase: 'failed', version: update.version, reason: e instanceof Error ? e.message : String(e) });
  } finally {
    abort = null;
  }
}

export function cancelInstall() {
  abort?.abort();
  if (state.phase === 'failed') set({ phase: 'idle' });
}

/** Delete downloaded APKs that are already installed (or older). Run once per launch. */
export function cleanUpdateDownloads() {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      const version = NAME.exec(entry.name)?.[1];
      if (version && entry instanceof File && !isNewer(version, installedVersion())) entry.delete();
    }
  } catch {
    // The cache is the system's to clear; a leftover file does no harm.
  }
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}
