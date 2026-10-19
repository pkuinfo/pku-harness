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
import { cx } from '@/utils/cx';

import { Aurora } from './aurora';
import { IconButton } from './button';
import { Text } from './text';

/** Scroll distance over which the large title hands over to the compact bar. */
const COLLAPSE = 56;
const CONTENT = { maxWidth: MAX_CONTENT_WIDTH } as const;
const HEADER = { maxWidth: MAX_CONTENT_WIDTH, transformOrigin: 'left bottom' } as const;

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
  const m = glassMaterial[useThemeName()];
  const c = useTheme();
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
  // Status-bar scrim: content scrolling under the clock is covered right away, before the
  // compact bar has faded in.
  const scrimStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [0, 24], [0, 0.95], Extrapolation.CLAMP) }));
  const compactTitle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(y.get(), [COLLAPSE * 0.6, COLLAPSE], [6, 0], Extrapolation.CLAMP) }] }));

  const backButton = back ? <IconButton icon="back" label="返回" variant="ghost" onPress={() => router.back()} className="-ml-2 mb-0.5" /> : null;
  const header = (
    <Animated.View className="w-full flex-row items-end gap-3 self-center px-4 pb-3 pt-4" style={[HEADER, largeStyle]}>
      {backButton}
      <View className="flex-1 gap-0.5">
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
      <View className={cx('flex-1', provided ? 'bg-transparent' : 'bg-bg')} style={{ paddingTop: insets.top, paddingBottom: bar }}>
        {backdrop}
        <Animated.View className="flex-1" style={enter}>
          {header}
          {children}
        </Animated.View>
      </View>
    );
  }
  return (
    <View className={cx('flex-1', provided ? 'bg-transparent' : 'bg-bg')}>
      {backdrop}
      <Animated.ScrollView
        className="flex-1"
        style={enter}
        contentContainerStyle={[{ paddingTop: insets.top, paddingBottom: spacing.xxxl + bar }, contentContainerStyle]}
        scrollIndicatorInsets={{ bottom: bar }}
        scrollEventThrottle={16}
        onScroll={onScroll}
        {...scrollProps}>
        {header}
        <View className="w-full gap-6 self-center px-4" style={CONTENT}>
          {children}
        </View>
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" className="absolute left-0 right-0 top-0" style={[{ height: insets.top, backgroundColor: c.bg }, scrimStyle]} />
      {/* Compact bar: appears once the large title has scrolled away. */}
      <Animated.View pointerEvents={collapsed ? 'box-none' : 'none'} className="absolute left-0 right-0 top-0" style={[{ paddingTop: insets.top }, compactStyle]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: 0.95 }]} />
        <View pointerEvents="none" className="absolute bottom-0 left-0 right-0 h-[0.5px]" style={{ backgroundColor: m.edge }} />
        <View className="h-13 flex-row items-center px-2">
          <View className="w-24 flex-row items-center">{backButton}</View>
          <Animated.View className="flex-1 items-center" style={compactTitle}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {title}
            </Text>
          </Animated.View>
          <View className="w-24 flex-row items-center justify-end">{trailing}</View>
        </View>
      </Animated.View>
    </View>
  );
}

