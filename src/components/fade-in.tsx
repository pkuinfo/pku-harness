import { useMemo, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn as FadeInAnim, FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { springs, stagger } from '@/theme';

/** Enter animation: fade + rise with the shared spring; `index` staggers list items. */
export function FadeIn({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const delay = Math.min(index, stagger.maxItems) * stagger.step;
  // Stable across renders: a streaming reply re-renders its FadeIn many times a second.
  const entering = useMemo(
    () => (reduced ? FadeInAnim.delay(delay) : FadeInDown.delay(delay).springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness)),
    [reduced, delay],
  );
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
