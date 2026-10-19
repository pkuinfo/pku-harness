import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH } from '@/hooks/use-layout';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { spacing, useTheme } from '@/theme';

import { IconButton } from './button';
import { Text } from './text';

/** Standard tab screen: large title header + scrollable content with token padding. */
export function Screen({
  title,
  subtitle,
  trailing,
  children,
  scroll = true,
  back,
  contentContainerStyle,
  ...scrollProps
}: ScrollViewProps & {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  /** Pushed screens: show a back button that pops the stack. */
  back?: boolean;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const bar = useTabBarInset();
  const header = (
    <View style={styles.header}>
      {back ? (
        <IconButton icon="back" label="返回" variant="ghost" onPress={() => router.back()} style={styles.back} />
      ) : null}
      <View style={{ flex: 1, gap: spacing.xxs }}>
        {subtitle ? (
          <Text variant="micro" tone="faint">
            {subtitle.toUpperCase()}
          </Text>
        ) : null}
        <Text variant="title">{title}</Text>
      </View>
      {trailing}
    </View>
  );
  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: bar }}>
        {header}
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[{ paddingTop: insets.top, paddingBottom: spacing.xxxl + bar }, contentContainerStyle]}
      scrollIndicatorInsets={{ bottom: bar }}
      {...scrollProps}>
      {header}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  back: { marginLeft: -spacing.sm, marginBottom: spacing.xxs },
  body: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: spacing.lg, gap: spacing.xl },
});
