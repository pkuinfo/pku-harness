import { Easing, FadeIn, FadeOut, LinearTransition, SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { curves } from './motion';

/**
 * The app's motion (docs/DESIGN.md, Motion): short, timed, ease-out, the way native Android and
 * iOS move. No springs, no overshoot, no zooming in and no staggered cascades. Kept out of the
 * theme index so pure unit tests don't load Reanimated.
 */
const OUT = Easing.bezier(...curves.out);
const SHEET = Easing.bezier(...curves.sheet);

/** For `withTiming`: small state changes (a press, a chevron) and larger moves (an indicator, a bar). */
export const timings = {
  fast: { duration: 140, easing: OUT },
  base: { duration: 220, easing: OUT },
} as const;

/** Layout-animation builders for `entering` / `exiting` / `layout`. */
export const transitions = {
  /** Something appears: a quick fade in place. */
  enter: FadeIn.duration(180).easing(OUT),
  exit: FadeOut.duration(120),
  /** Size or position changes. */
  layout: LinearTransition.duration(200).easing(OUT),
  /** A panel rising from the bottom edge, and leaving the same way. */
  sheetIn: SlideInDown.duration(280).easing(SHEET),
  sheetOut: SlideOutDown.duration(200).easing(OUT),
} as const;
