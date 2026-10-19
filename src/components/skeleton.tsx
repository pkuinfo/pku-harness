import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radius } from '@/theme';
import { cx } from '@/utils/cx';

/** Shimmering placeholder for loading states. No full-screen spinners. */
export function Skeleton({
  width = '100%',
  height = 16,
  rounded = radius.sm,
  style,
  className,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.45);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View className={cx('bg-surface-3', className)} style={[{ width, height, borderRadius: rounded }, animated, style]} />
  );
}
