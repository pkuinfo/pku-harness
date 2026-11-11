import type { TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { spacing, springs, typography, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Icon, type IconName } from './icon';

export type TabButtonProps = TabTriggerSlotProps & {
  icon: IconName;
  label: string;
};

/** Inner padding of the floating pill; the selected-tab highlight is inset by it. */
export const TAB_BAR_PAD = spacing.xs + 2;

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
      <Animated.View style={iconStyle}>
        <Icon name={icon} size={22} color={isFocused ? c.text : c.textMuted} />
      </Animated.View>
      <Animated.Text style={[typography.micro, labelStyle]} numberOfLines={1}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

/** The lighter pill behind the active tab, filling its cell inside the floating bar; it slides between tabs. */
export function TabIndicator({ index, count, width, height }: { index: number; count: number; width: number; height: number }) {
  const tabW = (width - TAB_BAR_PAD * 2) / count;
  const x = useSharedValue(TAB_BAR_PAD + index * tabW);
  useEffect(() => {
    if (width <= 0 || index < 0) return;
    x.set(withSpring(TAB_BAR_PAD + index * tabW, springs.smooth));
  }, [index, tabW, width, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  if (width <= 0 || height <= 0 || index < 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute left-0 rounded-full bg-surface-3"
      style={[{ top: TAB_BAR_PAD, width: tabW, height: height - TAB_BAR_PAD * 2 }, style]}
    />
  );
}
