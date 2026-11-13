import { NativeModule, requireOptionalNativeModule } from 'expo';

export type UpdateDownload =
  | { status: 'none' }
  | { status: 'pending' | 'running' | 'paused'; version: string; written: number; total: number; /** Waiting for Wi-Fi (or another allowed network). */ waitingForNetwork: boolean }
  | { status: 'done'; version: string; total: number }
  | { status: 'failed'; version: string; reason: string };

/**
 * Downloads a release APK with Android's DownloadManager, so it keeps going when the app is in
 * the background or the screen is off, with the system's own progress notification. When it
 * finishes, the app posts "Tap to install"; `install` opens Android's package installer (which
 * checks the APK is signed with the same key as the installed app).
 */
declare class AppUpdaterModule extends NativeModule<{ onDownloadChange: (state: UpdateDownload) => void }> {
  /** Start (or keep) the download of `version`. `wifiOnly` waits for an unmetered network. */
  download(options: { url: string; version: string; size: number; title: string; description: string; wifiOnly: boolean; readyTitle: string; readyText: string; channelName: string }): Promise<UpdateDownload>;
  /** The current (or last) download. */
  status(): Promise<UpdateDownload>;
  cancel(): Promise<void>;
  /** Open the installer for the finished download; false when there is none. */
  install(): Promise<boolean>;
  /** Forget downloads of versions that are installed (or older). */
  clean(installedVersion: string): Promise<void>;
}

/** Android only; null elsewhere. */
export default requireOptionalNativeModule<AppUpdaterModule>('AppUpdater');
