import type { TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { radius, spacing, springs, typography, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Icon, type IconName } from './icon';

export type TabButtonProps = TabTriggerSlotProps & {
  icon: IconName;
  label: string;
};

/**
 * One tab in the floating bar. The active tab grows an accent pill behind its icon and
 * reveals its label; transitions run on the UI thread with the shared `smooth` spring.
 */
export function TabButton({ icon, label, isFocused, onPress, ref: _ref, ...props }: TabButtonProps) {
  const c = useTheme();
  const focus = useSharedValue(isFocused ? 1 : 0);
  useEffect(() => {
    focus.value = withSpring(isFocused ? 1 : 0, springs.smooth);
  }, [isFocused, focus]);

  const pill = useAnimatedStyle(() => ({
    opacity: focus.value,
    transform: [{ scaleX: 0.6 + focus.value * 0.4 }, { scaleY: 0.8 + focus.value * 0.2 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 * focus.value }, { scale: 1 + 0.06 * focus.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focus.value, [0, 1], [c.textFaint, c.text]),
  }));

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
      style={styles.tab}>
      <View style={styles.iconSlot}>
        <Animated.View style={[styles.pill, { backgroundColor: c.accentMuted }, pill]} />
        <Animated.View style={iconStyle}>
          <Icon name={icon} size={22} color={isFocused ? c.accent : c.textMuted} />
        </Animated.View>
      </View>
      <Animated.Text style={[typography.micro, labelStyle]}>{label}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingVertical: spacing.sm },
  iconSlot: { width: 60, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: { ...StyleSheet.absoluteFill, borderRadius: radius.full },
});
