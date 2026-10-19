import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type ScrollViewProps } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackdropProvided } from '@/hooks/use-backdrop';
import { useFocusEnter } from '@/hooks/use-focus-enter';
import { MAX_CONTENT_WIDTH } from '@/hooks/use-layout';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { glassMaterial, spacing, useTheme, useThemeName } from '@/theme';

import { Aurora } from './aurora';
import { IconButton } from './button';
import { Text } from './text';

/** Scroll distance over which the large title hands over to the compact bar. */
const COLLAPSE = 56;

/**
 * Standard screen: aurora backdrop (unless a layout already paints it), large title header and
 * scrolling content. Scrolling, the large title drifts up and fades while a compact glass bar
 * with the small title fades in, all on the UI thread.
 */
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
  const m = glassMaterial[useThemeName()];
  const insets = useSafeAreaInsets();
  const bar = useTabBarInset();
  const provided = useBackdropProvided();
  const enter = useFocusEnter();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });
  // The compact bar takes touches only once visible, so it never shadows the large header.
  const [collapsed, setCollapsed] = useState(false);
  useAnimatedReaction(
    () => y.get() > COLLAPSE * 0.8,
    (now, before) => {
      if (now !== before) scheduleOnRN(setCollapsed, now);
    },
  );

  const largeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, COLLAPSE * 0.8], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(y.get(), [-80, 0, COLLAPSE], [24, 0, -10], Extrapolation.CLAMP) },
      { scale: interpolate(y.get(), [-120, 0], [1.08, 1], Extrapolation.CLAMP) },
    ],
  }));
  const compactStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [COLLAPSE * 0.6, COLLAPSE], [0, 1], Extrapolation.CLAMP) }));
  const compactTitle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(y.get(), [COLLAPSE * 0.6, COLLAPSE], [6, 0], Extrapolation.CLAMP) }] }));

  const backButton = back ? <IconButton icon="back" label="返回" variant="ghost" onPress={() => router.back()} style={styles.back} /> : null;
  const header = (
    <Animated.View style={[styles.header, largeStyle]}>
      {backButton}
      <View style={{ flex: 1, gap: spacing.xxs }}>
        {subtitle ? (
          <Text variant="micro" tone="faint">
            {subtitle.toUpperCase()}
          </Text>
        ) : null}
        <Text variant="title">{title}</Text>
      </View>
      {trailing}
    </Animated.View>
  );

  const backdrop = provided ? null : <Aurora />;

  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: provided ? 'transparent' : c.bg, paddingTop: insets.top, paddingBottom: bar }}>
        {backdrop}
        <Animated.View style={[{ flex: 1 }, enter]}>
          {header}
          {children}
        </Animated.View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: provided ? 'transparent' : c.bg }}>
      {backdrop}
      <Animated.ScrollView
        style={[{ flex: 1 }, enter]}
        contentContainerStyle={[{ paddingTop: insets.top, paddingBottom: spacing.xxxl + bar }, contentContainerStyle]}
        scrollIndicatorInsets={{ bottom: bar }}
        scrollEventThrottle={16}
        onScroll={onScroll}
        {...scrollProps}>
        {header}
        <View style={styles.body}>{children}</View>
      </Animated.ScrollView>
      {/* Compact bar: appears once the large title has scrolled away. */}
      <Animated.View pointerEvents={collapsed ? 'box-none' : 'none'} style={[styles.compact, { paddingTop: insets.top }, compactStyle]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: 0.86 }]} />
        <View pointerEvents="none" style={[styles.compactEdge, { backgroundColor: m.edge }]} />
        <View style={styles.compactRow}>
          <View style={styles.compactSide}>{backButton}</View>
          <Animated.View style={[{ flex: 1, alignItems: 'center' }, compactTitle]}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {title}
            </Text>
          </Animated.View>
          <View style={[styles.compactSide, { alignItems: 'flex-end' }]}>{trailing}</View>
        </View>
      </Animated.View>
    </View>
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
    transformOrigin: 'left bottom',
  },
  back: { marginLeft: -spacing.sm, marginBottom: spacing.xxs },
  body: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: spacing.lg, gap: spacing.xl },
  compact: { position: 'absolute', top: 0, left: 0, right: 0 },
  compactEdge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  compactRow: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm },
  compactSide: { width: 96, flexDirection: 'row', alignItems: 'center' },
});
