import { RNHostView } from '@expo/ui';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isOnboarded } from '@/core/boot';
import { legalNoticeDue, markLegalAccepted } from '@/core/legal';
import { checkOnLaunch, installedVersion, snooze, type AppUpdate } from '@/core/update/app-update';
import { cancelInstall, cleanUpdateDownloads, installUpdate, useInstallState, type InstallState } from '@/core/update/install';
import { useLocale, useT } from '@/i18n';
import { curves, spacing, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Button } from './button';
import { Icon } from './icon';
import { Logo } from './logo';
import { NativeSheet } from './native-sheet';
import { Text } from './text';

const CURVE = { borderCurve: 'continuous' } as const;
/** Material 3's maximum width for a bottom sheet (dp); wider screens centre it. */
const SHEET_MAX_WIDTH = 640;
const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_048_576))} MB`;
/** Progress counts from 0 (`mb` rounds a tiny size up to 1 MB). */
const mbDone = (bytes: number) => `${Math.round(bytes / 1_048_576)} MB`;

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

/**
 * Mounted once at the root: checks for a newer APK shortly after launch (not during the welcome)
 * (after a one-time notice about the terms, when due), and hosts the update sheet, which offers the
 * release and then shows its download in place until Android's installer takes over.
 */
export function UpdatePrompt() {
  const [legal, setLegal] = useState<'new' | 'updated' | null>(null);
  useEffect(() => {
    cleanUpdateDownloads();
    if (!isOnboarded()) return;
    const id = setTimeout(() => {
      void (async () => {
        // People who set up before the terms existed (or before a material change) hear about them once.
        const legal = await legalNoticeDue();
        if (legal) {
          void markLegalAccepted();
          return setLegal(legal);
        }
        const u = await checkOnLaunch();
        if (u) promptAppUpdate(u);
      })();
    }, 3000);
    return () => clearTimeout(id);
  }, []);
  return (
    <>
      <UpdateSheet />
      <LegalSheet kind={legal} onClose={() => setLegal(null)} />
    </>
  );
}

/** The one-time notice about the terms (new, or a material change), as a native bottom sheet (@expo/ui). */
function LegalSheet({ kind, onClose }: { kind: 'new' | 'updated' | null; onClose: () => void }) {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  // The native sheet measures its React content without a width limit: give it one so text wraps.
  const width = Math.min(useWindowDimensions().width, SHEET_MAX_WIDTH);
  // Keep the last kind while the sheet animates out.
  const [shown, setShown] = useState(kind);
  if (kind && kind !== shown) setShown(kind);
  const updated = shown === 'updated';
  const read = () => {
    onClose();
    router.push('/legal/privacy');
  };
  return (
    <NativeSheet open={!!kind} onDismiss={onClose} color={c.elevated}>
      <RNHostView matchContents>
        <View className="gap-5 px-6 pt-1" style={{ width, paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm }}>
          <View className="flex-row items-center gap-4">
            <View className="size-12 items-center justify-center rounded-lg bg-accent-muted" style={CURVE}>
              <Icon name={updated ? 'file' : 'shield'} size={24} color={c.accent} />
            </View>
            <Text variant="headline" className="flex-1">
              {t(updated ? 'app.settings.legalUpdatedTitle' : 'app.settings.legalNoticeTitle')}
            </Text>
          </View>
          <Text variant="callout" tone="muted">
            {t(updated ? 'app.settings.legalUpdatedBody' : 'app.settings.legalNoticeBody')}
          </Text>
          <View className="gap-2">
            <Button size="lg" title={t('app.settings.legalNoticeOk')} onPress={onClose} />
            <Button size="lg" variant="ghost" icon="file" title={t('app.settings.legalNoticeRead')} onPress={read} />
          </View>
        </View>
      </RNHostView>
    </NativeSheet>
  );
}

/**
 * The update offer and its download, as a native bottom sheet (@expo/ui): the platform's own
 * slide and drag-to-dismiss, and never taller than the screen (the notes scroll).
 */
function UpdateSheet() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const width = Math.min(screenW, SHEET_MAX_WIDTH);
  const update = useOffered();
  const install = useInstallState();
  // Swiped away during a download: the download goes on, the sheet stays closed (Material removes
  // its window on dismiss, so it must not stay "open" behind the scenes). A new offer or a
  // failure shows it again.
  const downloadKey = install.phase === 'downloading' ? `download:${install.version}` : null;
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const open = (!!update || install.phase !== 'idle') && (downloadKey === null || hiddenFor !== downloadKey);
  // Keep the last offer on screen while the sheet slides away.
  const [shown, setShown] = useState(update);
  if (update && update !== shown) setShown(update);

  // A finished (or cancelled) download closes the sheet; Android's installer takes over from here.
  const phase = useRef(install.phase);
  useEffect(() => {
    if (phase.current === 'downloading' && install.phase === 'idle') setOffered(null);
    phase.current = install.phase;
  }, [install.phase]);

  // Swipe down, back or a tap outside: an unanswered offer counts as Later; a running download
  // keeps going in the background (the installer still opens when it finishes); a failure is dismissed.
  const dismiss = useCallback(() => {
    if (install.phase === 'failed') cancelInstall();
    else if (install.phase === 'idle' && update) void snooze(update);
    else if (downloadKey) setHiddenFor(downloadKey);
    setOffered(null);
  }, [install.phase, update, downloadKey]);

  return (
    <NativeSheet open={open} onDismiss={dismiss} color={c.elevated}>
      <RNHostView matchContents>
        <View className="gap-5 px-6 pt-1" style={{ width, paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm }}>
          {shown || install.phase !== 'idle' ? <Body update={update ?? shown} install={install} /> : null}
        </View>
      </RNHostView>
    </NativeSheet>
  );
}

function Body({ update, install }: { update: AppUpdate | null; install: InstallState }) {
  const t = useT();
  const { height: screenH } = useWindowDimensions();
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
          {/* Long release notes scroll inside the sheet instead of pushing it past the screen. */}
          <ScrollView style={{ maxHeight: Math.round(screenH * 0.32) }} contentContainerClassName="gap-2.5" showsVerticalScrollIndicator nestedScrollEnabled>
            {notes.map((n) => (
              <View key={n} className="flex-row gap-3">
                <View className="mt-2 size-1.5 rounded-full bg-brand" />
                <Text variant="callout" className="flex-1">
                  {n}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View className="flex-row items-center gap-2.5 rounded-lg bg-surface-3 px-4 py-3" style={CURVE}>
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
          {total > 0 ? `${percent}%` : mbDone(written)}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-surface-3" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
        <Animated.View className="h-full rounded-full bg-brand" style={bar} />
      </View>
      <Text variant="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
        {total > 0 ? t('app.settings.updateProgress', { written: mbDone(written), total: mb(total) }) : mbDone(written)}
      </Text>
    </View>
  );
}
