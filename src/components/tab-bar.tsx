import type { TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { spacing, springs, typography, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Icon, type IconName } from './icon';

export type TabButtonProps = TabTriggerSlotProps & {
  icon: IconName;
  label: string;
};

/** Icon well size; the sliding indicator matches it. */
export const TAB_WELL = { width: 60, height: 32 } as const;
/** Bar paddings the indicator needs to line up with the wells. */
export const TAB_BAR_PAD = { top: spacing.xs, side: spacing.sm, well: spacing.sm } as const;

/**
 * One tab. Selecting it pops the icon with a small overshoot and brightens the label; the
 * highlight behind the icon is the shared sliding `TabIndicator`.
 */
// `style` is dropped on purpose: TabTrigger's slot injects `flexDirection: 'row'`, which as an
// inline style would beat the className layout.
export function TabButton({ icon, label, isFocused, onPress, ref: _ref, style: _style, ...props }: TabButtonProps) {
  const c = useTheme();
  const focus = useSharedValue(isFocused ? 1 : 0);
  const pop = useSharedValue(1);
  useEffect(() => {
    focus.set(withSpring(isFocused ? 1 : 0, springs.smooth));
    if (isFocused) pop.set(withSequence(withSpring(1.18, springs.snappy), withSpring(1, springs.bouncy)));
  }, [isFocused, focus, pop]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -1.5 * focus.get() }, { scale: pop.get() }] }));
  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(focus.get(), [0, 1], [c.textFaint, c.text]) }));

  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      onPress={(e) => {
        if (!isFocused) haptics.select();
        onPress?.(e);
      }}
      className="flex-1 items-center justify-center gap-0.5 py-2">
      <View className="h-8 w-[60px] items-center justify-center">
        <Animated.View style={iconStyle}>
          <Icon name={icon} size={22} color={isFocused ? c.accent : c.textMuted} />
        </Animated.View>
      </View>
      <Animated.Text style={[typography.micro, labelStyle]}>{label}</Animated.Text>
    </Pressable>
  );
}

/** The highlight behind the active tab's icon, sliding between tabs with a spring. */
export function TabIndicator({ index, count, width }: { index: number; count: number; width: number }) {
  const tabW = (width - TAB_BAR_PAD.side * 2) / count;
  const x = useSharedValue(TAB_BAR_PAD.side + index * tabW + (tabW - TAB_WELL.width) / 2);
  const stretch = useSharedValue(1);
  useEffect(() => {
    if (width <= 0 || index < 0) return;
    x.set(withSpring(TAB_BAR_PAD.side + index * tabW + (tabW - TAB_WELL.width) / 2, springs.smooth));
    // Stretch a little in flight, like a drop of light moving.
    stretch.set(withSequence(withSpring(1.35, springs.snappy), withSpring(1, springs.smooth)));
  }, [index, tabW, width, x, stretch]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { scaleX: stretch.get() }] }));
  if (width <= 0 || index < 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute left-0 h-8 w-[60px] rounded-md bg-accent-muted"
      style={[{ borderCurve: 'continuous', top: TAB_BAR_PAD.top + TAB_BAR_PAD.well }, style]}
    />
  );
}
