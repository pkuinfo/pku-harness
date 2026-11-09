import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';

import { isOnboarded } from '@/core/boot';
import { checkOnLaunch, installedVersion, snooze, type AppUpdate } from '@/core/update/app-update';
import { t } from '@/i18n';

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_048_576))} MB`;

/** Ask once about a newer release (Download opens its APK; Later quiets it for a few days). */
export function promptAppUpdate(update: AppUpdate) {
  Alert.alert(t('app.settings.updateTitle', { version: update.version }), t('app.settings.updateBody', { current: installedVersion(), size: mb(update.size) }), [
    { text: t('app.settings.updateLater'), style: 'cancel', onPress: () => void snooze(update) },
    { text: t('app.settings.updateDownload'), onPress: () => void Linking.openURL(update.url) },
  ]);
}

/** Mounted once at the root: checks for a newer APK shortly after launch (not during the welcome). */
export function UpdatePrompt() {
  useEffect(() => {
    if (!isOnboarded()) return;
    const id = setTimeout(() => {
      void checkOnLaunch().then((u) => u && promptAppUpdate(u));
    }, 3000);
    return () => clearTimeout(id);
  }, []);
  return null;
}
