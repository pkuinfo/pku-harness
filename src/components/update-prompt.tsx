import { BottomSheet, RNHostView } from '@expo/ui';
import { router } from 'expo-router';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Alert, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isOnboarded } from '@/core/boot';
import { legalNoticeDue, markLegalAccepted } from '@/core/legal';
import { checkOnLaunch, installedVersion, snooze, type AppUpdate } from '@/core/update/app-update';
import { cancelInstall, cleanUpdateDownloads, installUpdate, useInstallState, type InstallState } from '@/core/update/install';
import { t, useLocale, useT } from '@/i18n';
import { curves, spacing, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Button } from './button';
import { Icon } from './icon';
import { Logo } from './logo';
import { Text } from './text';

const CURVE = { borderCurve: 'continuous' } as const;
const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_048_576))} MB`;

// The release the sheet is offering (set by the launch check or Settings; cleared by Later / Update).
let offered: AppUpdate | null = null;
const listeners = new Set<() => void>();
const setOffered = (u: AppUpdate | null) => {
  offered = u;
  listeners.forEach((l) => l());
};
const useOffered = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => offered,
  );

/** Offer a newer release in the update sheet (Update downloads it and opens the installer; Later quiets it for a few days). */
export function promptAppUpdate(update: AppUpdate) {
  setOffered(update);
}

function promptLegalNotice() {
  void markLegalAccepted();
  Alert.alert(t('app.settings.legalNoticeTitle'), t('app.settings.legalNoticeBody'), [
    { text: t('app.settings.legalNoticeRead'), onPress: () => router.push('/legal/privacy') },
    { text: t('app.settings.legalNoticeOk') },
  ]);
}

/**
 * Mounted once at the root: checks for a newer APK shortly after launch (not during the welcome)
 * (after a one-time notice about the terms, when due), and hosts the update sheet, which offers the
 * release and then shows its download in place until Android's installer takes over.
 */
export function UpdatePrompt() {
  useEffect(() => {
    cleanUpdateDownloads();
    if (!isOnboarded()) return;
    const id = setTimeout(() => {
      void (async () => {
        // People who set up before the terms existed (or before a material change) hear about them once.
        if (await legalNoticeDue()) return promptLegalNotice();
        const u = await checkOnLaunch();
        if (u) promptAppUpdate(u);
      })();
    }, 3000);
    return () => clearTimeout(id);
  }, []);
  return <UpdateSheet />;
}

function UpdateSheet() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const update = useOffered();
  const install = useInstallState();
  const open = !!update || install.phase !== 'idle';

  // A finished (or cancelled) download closes the sheet; Android's installer takes over from here.
  const phase = useRef(install.phase);
  useEffect(() => {
    if (phase.current === 'downloading' && install.phase === 'idle') setOffered(null);
    phase.current = install.phase;
  }, [install.phase]);

  // Swiping the sheet away: an unanswered offer counts as Later; a running download keeps going in
  // the background (the installer still opens when it finishes); a failure is dismissed.
  const onDismiss = () => {
    if (install.phase === 'failed') cancelInstall();
    else if (install.phase === 'idle' && update) void snooze(update);
    setOffered(null);
  };

  return (
    <BottomSheet isPresented={open} onDismiss={onDismiss} containerColor={c.elevated} contentPadding={{ left: 0, right: 0, top: 0, bottom: 0 }}>
      <RNHostView matchContents>
        <View className="gap-5 px-6 pt-2" style={{ paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm }} accessibilityViewIsModal>
          {update || install.phase !== 'idle' ? <Body update={update} install={install} /> : null}
        </View>
      </RNHostView>
    </BottomSheet>
  );
}

function Body({ update, install }: { update: AppUpdate | null; install: InstallState }) {
  const t = useT();
  const locale = useLocale();
  const c = useTheme();
  const version = install.phase === 'idle' ? update!.version : install.version;
  const notes = update?.notes?.[locale] ?? [];

  const start = () => {
    if (!update) return;
    haptics.tap();
    void installUpdate(update);
  };
  const later = () => {
    if (update) void snooze(update);
    setOffered(null);
  };
  const cancel = () => {
    cancelInstall();
    setOffered(null);
  };

  return (
    <>
      <View className="flex-row items-center gap-4">
        <Logo size={56} />
        <View className="flex-1 gap-0.5">
          <Text variant="headline">{t('app.settings.updateSheetTitle', { version })}</Text>
          <Text variant="caption" tone="muted">
            {update?.size ? t('app.settings.updateFromTo', { current: installedVersion(), version, size: mb(update.size) }) : t('app.settings.updateFromToNoSize', { current: installedVersion(), version })}
          </Text>
        </View>
      </View>

      {install.phase === 'downloading' ? (
        <Progress written={install.written} total={install.total} />
      ) : install.phase === 'failed' ? (
        <View className="flex-row gap-3 rounded-lg bg-down-muted px-4 py-3" style={CURVE}>
          <Icon name="warning" size={18} color={c.down} />
          <View className="flex-1 gap-0.5">
            <Text variant="callout">{t('app.settings.updateFailedTitle', { version })}</Text>
            <Text variant="caption" tone="muted">
              {t('app.settings.updateFailed', { reason: install.reason })}
            </Text>
          </View>
        </View>
      ) : notes.length ? (
        <View className="gap-2.5">
          <Text variant="micro" tone="faint">
            {t('app.settings.updateWhatsNew')}
          </Text>
          {notes.map((n) => (
            <View key={n} className="flex-row gap-3">
              <View className="mt-2 size-1.5 rounded-full bg-brand" />
              <Text variant="callout" className="flex-1">
                {n}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-center gap-2.5 rounded-lg bg-surface-2 px-4 py-3" style={CURVE}>
        <Icon name={install.phase === 'downloading' ? 'shield' : 'check'} size={16} color={c.textMuted} />
        <Text variant="caption" tone="muted" className="flex-1">
          {t(install.phase === 'downloading' ? 'app.settings.updateInstallHint' : 'app.settings.updateKeeps')}
        </Text>
      </View>

      {install.phase === 'downloading' ? (
        <Button size="lg" variant="secondary" title={t('app.settings.updateCancel')} onPress={cancel} />
      ) : install.phase === 'failed' ? (
        <View className="gap-2">
          {update ? <Button size="lg" icon="refresh" title={t('app.settings.updateRetry')} onPress={start} /> : null}
          <Button size="lg" variant="ghost" title={t('app.settings.updateClose')} onPress={cancel} />
        </View>
      ) : (
        <View className="gap-2">
          <Button size="lg" icon="download" title={t('app.settings.updateDownload')} onPress={start} />
          <Button size="lg" variant="ghost" title={t('app.settings.updateLater')} onPress={later} />
        </View>
      )}
    </>
  );
}

function Progress({ written, total }: { written: number; total: number }) {
  const t = useT();
  const reduced = useReducedMotion();
  const ratio = total > 0 ? Math.min(1, written / total) : 0;
  const width = useSharedValue(ratio);
  useEffect(() => {
    width.set(reduced ? ratio : withTiming(ratio, { duration: 240, easing: Easing.bezier(...curves.out) }));
  }, [ratio, reduced, width]);
  const bar = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }));
  const percent = Math.round(ratio * 100);
  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline justify-between">
        <Text variant="callout">{t('app.settings.updateDownloadingShort')}</Text>
        <Text variant="callout" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {total > 0 ? `${percent}%` : mb(written)}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-surface-3" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
        <Animated.View className="h-full rounded-full bg-brand" style={bar} />
      </View>
      <Text variant="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
        {total > 0 ? t('app.settings.updateProgress', { written: mb(written), total: mb(total) }) : mb(written)}
      </Text>
    </View>
  );
}
