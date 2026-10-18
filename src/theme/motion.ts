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

/** Easing curves (cubic-bezier control points); build with `Easing.bezier(...curves.out)`. */
export const curves = {
  /** Strong ease-out for anything entering or responding. */
  out: [0.23, 1, 0.32, 1],
  /** On-screen movement and morphs. */
  inOut: [0.77, 0, 0.175, 1],
  /** iOS sheet curve. */
  sheet: [0.32, 0.72, 0, 1],
} as const;
