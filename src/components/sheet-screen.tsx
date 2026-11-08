import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH } from '@/hooks/use-layout';
import { useT } from '@/i18n';
import { spacing, useTheme } from '@/theme';
import { cx } from '@/utils/cx';

import { Aurora } from './aurora';
import { Button, IconButton } from './button';
import { Icon } from './icon';
import { Text } from './text';

/** How long a freshly opened sheet ignores touches on its content (the opening animation). */
const ARM_MS = 300;

/** Close a sheet; when opened from a deep link there is nothing to go back to, so replace. */
export function dismiss(fallback: '/schedule' | '/' | '/settings' = '/schedule') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export type SheetNotice = { tone: 'down' | 'warn' | 'info'; text: string; action?: { label: string; onPress: () => void } };

// Static class strings (Uniwind can't see interpolated ones).
const NOTICE_BG = { down: 'bg-down-muted', warn: 'bg-warn-muted', info: 'bg-info-muted' } as const;
const NOTICE_ICON = { down: 'warning', warn: 'warning', info: 'help' } as const;

/**
 * Layout for form sheets: title + close, scrolling body, primary action pinned at the bottom.
 * `notice` (e.g. why the primary action failed) sits right above the pinned actions, so it is
 * never scrolled out of view the way a message at the end of the content can be.
 */
export function SheetScreen({
  title,
  children,
  primary,
  onPrimary,
  primaryDisabled,
  loading,
  danger,
  onDanger,
  secondary,
  onSecondary,
  notice,
}: {
  title: string;
  children: ReactNode;
  primary: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  loading?: boolean;
  danger?: string;
  onDanger?: () => void;
  secondary?: string;
  onSecondary?: () => void;
  notice?: SheetNotice;
}) {
  const t = useT();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  // The sheet slides in under the finger that opened it (often a long-press): ignore touches on
  // its controls for a moment so that finger can't land on a stepper or switch by accident.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(id);
  }, []);
  return (
    <KeyboardAvoidingView className="flex-1 bg-bg" behavior="padding">
      <Aurora />
      <View className="flex-row items-center px-4 pb-2" style={{ paddingTop: insets.top + spacing.sm }}>
        <Text variant="bodyStrong" className="flex-1">
          {title}
        </Text>
        <IconButton icon="close" label={t('core.common.close')} variant="ghost" onPress={() => dismiss()} />
      </View>
      <ScrollView pointerEvents={armed ? 'auto' : 'none'} contentContainerClassName="w-full self-center gap-4 p-4 pb-8" contentContainerStyle={{ maxWidth: MAX_CONTENT_WIDTH }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View className="gap-3 border-t-[0.5px] border-edge px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, spacing.md) }}>
        <View pointerEvents="none" className="absolute inset-0 bg-bg" />
        {notice ? (
          <Animated.View
            key={notice.text}
            entering={FadeIn}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className={cx('flex-row items-center gap-2 rounded-md p-3', NOTICE_BG[notice.tone])}
            style={{ borderCurve: 'continuous' }}>
            <Icon name={NOTICE_ICON[notice.tone]} size={16} color={c[notice.tone]} />
            <Text variant="caption" tone={notice.tone} className="flex-1">
              {notice.text}
            </Text>
            {notice.action ? <Button title={notice.action.label} variant="secondary" size="sm" onPress={notice.action.onPress} /> : null}
          </Animated.View>
        ) : null}
        <View className="flex-row gap-2">
          {danger && onDanger ? <Button title={danger} variant="danger" onPress={onDanger} className="flex-1" /> : null}
          {secondary && onSecondary ? <Button title={secondary} variant="secondary" onPress={onSecondary} className="flex-1" /> : null}
          <Button title={primary} onPress={onPrimary} disabled={primaryDisabled} loading={loading} className="flex-2" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
