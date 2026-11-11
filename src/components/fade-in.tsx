import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { transitions } from '@/theme/transitions';

/**
 * Enter animation: a quick fade in place (no rise, no cascade). `index` is accepted for callers
 * that used to stagger lists; items now appear together, as in native lists.
 */
export function FadeIn({ children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : transitions.enter} style={style}>
      {children}
    </Animated.View>
  );
}
