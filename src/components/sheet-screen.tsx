import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH } from '@/hooks/use-layout';
import { spacing, useTheme } from '@/theme';

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
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      <Aurora />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text variant="headline" style={{ flex: 1 }}>
          {title}
        </Text>
        <IconButton icon="close" label="关闭" variant="ghost" onPress={() => dismiss()} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md), borderTopColor: c.border }]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: 0.8 }]} />
        {danger && onDanger ? <Button title={danger} variant="danger" onPress={onDanger} style={{ flex: 1 }} /> : null}
        {secondary && onSecondary ? <Button title={secondary} variant="secondary" onPress={onSecondary} style={{ flex: 1 }} /> : null}
        <Button title={primary} onPress={onPrimary} disabled={primaryDisabled} loading={loading} style={{ flex: 2 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  body: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
