import type { WithSpringConfig } from 'react-native-reanimated';

/** Durations in ms. */
export const duration = {
  fast: 140,
  base: 240,
  slow: 420,
} as const;

/** Shared spring configs so motion across the app feels related. */
export const springs = {
  snappy: { damping: 22, stiffness: 420, mass: 0.6 },
  smooth: { damping: 26, stiffness: 220, mass: 1 },
  bouncy: { damping: 12, stiffness: 180, mass: 0.9 },
} as const satisfies Record<string, WithSpringConfig>;

export const stagger = {
  step: 40,
  maxItems: 8,
} as const;

/** Scale applied to pressables while pressed. */
export const pressScale = 0.97;
