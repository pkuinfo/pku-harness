import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { springs } from '@/theme';

/**
 * A screen settling in each time it gains focus (tab switch, return from a pushed screen):
 * quick fade, a short rise and a hint of scale on the shared spring. Reduced motion: none.
 */
export function useFocusEnter() {
  const reduced = useReducedMotion();
  const p = useSharedValue(1);
  useFocusEffect(
    useCallback(() => {
      if (reduced) return;
      p.set(0);
      p.set(withSpring(1, springs.smooth));
    }, [reduced, p]),
  );
  const opacity = useSharedValue(1);
  useFocusEffect(
    useCallback(() => {
      if (reduced) return;
      opacity.set(0.001);
      opacity.set(withTiming(1, { duration: 180 }));
    }, [reduced, opacity]),
  );
  return useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: (1 - p.get()) * 10 }, { scale: 0.985 + p.get() * 0.015 }],
  }));
}
