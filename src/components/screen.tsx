import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, useTheme } from '@/theme';

import { Text } from './text';

/** Standard tab screen: large title header + scrollable content with token padding. */
export function Screen({
  title,
  subtitle,
  trailing,
  children,
  scroll = true,
  contentContainerStyle,
  ...scrollProps
}: ScrollViewProps & {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const header = (
    <View style={styles.header}>
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
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        {header}
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[{ paddingTop: insets.top, paddingBottom: spacing.xxxl }, contentContainerStyle]}
      {...scrollProps}>
      {header}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl },
});
