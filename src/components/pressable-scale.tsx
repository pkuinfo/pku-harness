import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { timings } from '@/theme/transitions';
import { haptics } from '@/utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Kept for existing callers; presses now dim instead of shrinking. */
  scaleTo?: number;
  /** Fire a light haptic on press. */
  haptic?: boolean;
  /** Look disabled (dimmed). Defaults to `disabled`; false for controls that are only briefly inert (loading, running). */
  dimmed?: boolean;
};

/** Opacity while pressed: a quick, native-style dim (no shrink, no spring). */
const PRESSED = 0.55;
/**
 * Opacity of a disabled pressable. Applied here because the animated opacity is an inline style,
 * which overrides `opacity-*` classes callers used to dim disabled controls with.
 */
const DISABLED = 0.4;

/** Pressable with timed press feedback on the UI thread. Base of every tappable element. */
export function PressableScale({ style, children, scaleTo: _scaleTo, haptic = true, dimmed, onPressIn, onPressOut, onPress, disabled, ...rest }: PressableScaleProps) {
  const opacity = useSharedValue(1);
  const dim = (dimmed ?? !!disabled) ? DISABLED : 1;
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() * dim }), [dim]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        opacity.set(withTiming(PRESSED, { duration: 80 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        opacity.set(withTiming(1, timings.fast));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) haptics.tap();
        onPress?.(e);
      }}
      style={[animated, style]}>
      {children}
    </AnimatedPressable>
  );
}
