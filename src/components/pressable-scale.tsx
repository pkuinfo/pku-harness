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
};

/** Opacity while pressed: a quick, native-style dim (no shrink, no spring). */
const PRESSED = 0.55;

/** Pressable with timed press feedback on the UI thread. Base of every tappable element. */
export function PressableScale({ style, children, scaleTo: _scaleTo, haptic = true, onPressIn, onPressOut, onPress, disabled, ...rest }: PressableScaleProps) {
  const opacity = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));

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
