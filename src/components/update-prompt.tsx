import { useEffect } from 'react';
import { Alert, Modal, View } from 'react-native';

import { isOnboarded } from '@/core/boot';
import { checkOnLaunch, installedVersion, snooze, type AppUpdate } from '@/core/update/app-update';
import { cancelInstall, cleanUpdateDownloads, installUpdate, useInstallState } from '@/core/update/install';
import { t, useT } from '@/i18n';
import { useTheme } from '@/theme';

import { Button } from './button';
import { Text } from './text';

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_048_576))} MB`;

/** Ask once about a newer release (Update downloads it and opens the installer; Later quiets it for a few days). */
export function promptAppUpdate(update: AppUpdate) {
  Alert.alert(t('app.settings.updateTitle', { version: update.version }), t('app.settings.updateBody', { current: installedVersion(), size: mb(update.size) }), [
    { text: t('app.settings.updateLater'), style: 'cancel', onPress: () => void snooze(update) },
    { text: t('app.settings.updateDownload'), onPress: () => void installUpdate(update) },
  ]);
}

/**
 * Mounted once at the root: checks for a newer APK shortly after launch (not during the welcome)
 * and shows the download progress while an update is being fetched.
 */
export function UpdatePrompt() {
  useEffect(() => {
    cleanUpdateDownloads();
    if (!isOnboarded()) return;
    const id = setTimeout(() => {
      void checkOnLaunch().then((u) => u && promptAppUpdate(u));
    }, 3000);
    return () => clearTimeout(id);
  }, []);
  return <UpdateProgress />;
}

function UpdateProgress() {
  const t = useT();
  const c = useTheme();
  const s = useInstallState();
  if (s.phase === 'idle') return null;
  const ratio = s.phase === 'downloading' && s.total > 0 ? Math.min(1, s.written / s.total) : 0;
  return (
    <Modal transparent statusBarTranslucent animationType="fade" visible onRequestClose={cancelInstall}>
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: c.scrim }}>
        <View className="w-full max-w-sm gap-4 rounded-xl bg-surface p-6" style={{ borderCurve: 'continuous' }} accessibilityViewIsModal>
          <Text variant="headline">{t(s.phase === 'failed' ? 'app.settings.updateFailedTitle' : 'app.settings.updateDownloading', { version: s.version })}</Text>
          {s.phase === 'downloading' ? (
            <>
              <View
                className="h-1.5 overflow-hidden rounded-full bg-surface-3"
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}>
                <View className="h-full rounded-full bg-brand" style={{ width: `${ratio * 100}%` }} />
              </View>
              <Text variant="caption" tone="muted">
                {s.total > 0 ? `${mb(s.written)} / ${mb(s.total)}` : mb(s.written)}
              </Text>
              <Text variant="callout" tone="muted">
                {t('app.settings.updateInstallHint')}
              </Text>
            </>
          ) : (
            <Text variant="callout" tone="muted">
              {t('app.settings.updateFailed', { reason: s.reason })}
            </Text>
          )}
          <View className="flex-row justify-end">
            <Button size="sm" variant="ghost" title={t(s.phase === 'failed' ? 'app.settings.updateClose' : 'app.settings.updateCancel')} onPress={cancelInstall} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
