import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { timings } from '@/theme/transitions';

/**
 * A screen fading in each time it gains focus (tab switch, return from a pushed screen): a short
 * fade in place, like a native tab switch. No rise, no scale. Reduced motion: none.
 */
export function useFocusEnter() {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useFocusEffect(
    useCallback(() => {
      if (reduced) return;
      opacity.set(0.001);
      opacity.set(withTiming(1, timings.fast));
    }, [reduced, opacity]),
  );
  return useAnimatedStyle(() => ({ opacity: opacity.get() }));
}
