import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH } from '@/hooks/use-layout';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

import { Aurora } from './aurora';
import { Button, IconButton } from './button';
import { Text } from './text';

/** Close a sheet; when opened from a deep link there is nothing to go back to, so replace. */
export function dismiss(fallback: '/schedule' | '/' | '/settings' = '/schedule') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/** Layout for form sheets: title + close, scrolling body, primary action pinned at the bottom. */
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
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView className="flex-1 bg-bg" behavior="padding">
      <Aurora />
      <View className="flex-row items-center px-4 pb-2" style={{ paddingTop: insets.top + spacing.sm }}>
        <Text variant="headline" className="flex-1">
          {title}
        </Text>
        <IconButton icon="close" label={t('core.common.close')} variant="ghost" onPress={() => dismiss()} />
      </View>
      <ScrollView contentContainerClassName="w-full self-center gap-4 p-4 pb-8" contentContainerStyle={{ maxWidth: MAX_CONTENT_WIDTH }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View className="flex-row gap-2 border-t-[0.5px] border-edge px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, spacing.md) }}>
        <View pointerEvents="none" className="absolute inset-0 bg-bg opacity-80" />
        {danger && onDanger ? <Button title={danger} variant="danger" onPress={onDanger} className="flex-1" /> : null}
        {secondary && onSecondary ? <Button title={secondary} variant="secondary" onPress={onSecondary} className="flex-1" /> : null}
        <Button title={primary} onPress={onPrimary} disabled={primaryDisabled} loading={loading} className="flex-2" />
      </View>
    </KeyboardAvoidingView>
  );
}
