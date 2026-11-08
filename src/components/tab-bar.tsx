import type { TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

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
 * One tab. Selecting it brightens the icon and label; the
 * highlight behind the icon is the shared sliding `TabIndicator`.
 */
// `style` is dropped on purpose: TabTrigger's slot injects `flexDirection: 'row'`, which as an
// inline style would beat the className layout.
export function TabButton({ icon, label, isFocused, onPress, ref: _ref, style: _style, ...props }: TabButtonProps) {
  const c = useTheme();
  const focus = useSharedValue(isFocused ? 1 : 0);
  useEffect(() => {
    focus.set(withSpring(isFocused ? 1 : 0, springs.smooth));
  }, [isFocused, focus]);

  const iconStyle = useAnimatedStyle(() => ({ opacity: 0.75 + 0.25 * focus.get() }));
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
          <Icon name={icon} size={22} color={isFocused ? c.text : c.textMuted} />
        </Animated.View>
      </View>
      <Animated.Text style={[typography.micro, labelStyle]}>{label}</Animated.Text>
    </Pressable>
  );
}

/** The neutral highlight behind the active tab icon. */
export function TabIndicator({ index, count, width }: { index: number; count: number; width: number }) {
  const tabW = (width - TAB_BAR_PAD.side * 2) / count;
  const x = useSharedValue(TAB_BAR_PAD.side + index * tabW + (tabW - TAB_WELL.width) / 2);
  useEffect(() => {
    if (width <= 0 || index < 0) return;
    x.set(withSpring(TAB_BAR_PAD.side + index * tabW + (tabW - TAB_WELL.width) / 2, springs.smooth));
  }, [index, tabW, width, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  if (width <= 0 || index < 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute left-0 h-8 w-[60px] rounded-md bg-surface-2"
      style={[{ borderCurve: 'continuous', top: TAB_BAR_PAD.top + TAB_BAR_PAD.well }, style]}
    />
  );
}
