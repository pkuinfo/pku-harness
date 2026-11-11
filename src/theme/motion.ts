import type { WithSpringConfig } from 'react-native-reanimated';

/** Durations in ms. */
export const duration = {
  fast: 140,
  base: 240,
  slow: 420,
} as const;

/**
 * Critically damped springs, kept for the welcome scene and gesture follow-through only. UI
 * motion uses the timed `transitions` / `timings` in ./transitions.ts (docs/DESIGN.md, Motion).
 */
export const springs = {
  snappy: { damping: 32, stiffness: 420, mass: 0.6 },
  smooth: { damping: 30, stiffness: 220, mass: 1 },
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
