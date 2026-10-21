import { useEffect } from 'react';
import { cancelAnimation, Easing, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { curves } from '@/theme';

const EASE_OUT = Easing.bezier(...curves.out);
const SINE = Easing.inOut(Easing.sin);

/**
 * A 0 → 1 story clock on the UI thread: repeats while `running`; otherwise eases to `rest`, the
 * frame that tells the whole story (also the reduced-motion frame). Worklets derive every prop
 * from it, so nothing runs per frame on JS.
 */
export function useCycle(running: boolean, { duration, rest }: { duration: number; rest: number }) {
  const p = useSharedValue(rest);
  useEffect(() => {
    if (running) {
      p.set(0);
      p.set(withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
      return;
    }
    cancelAnimation(p);
    p.set(withTiming(rest, { duration: 600, easing: EASE_OUT }));
  }, [running, duration, rest, p]);
  return p;
}

/** The orb's breath: 0 ↔ 1 on a slow sine while `running`, resting at 0.6. */
export function useBreath(running: boolean, period = 3200) {
  const v = useSharedValue(0.6);
  useEffect(() => {
    if (!running) {
      cancelAnimation(v);
      v.set(withTiming(0.6, { duration: 800, easing: EASE_OUT }));
      return;
    }
    v.set(withRepeat(withSequence(withTiming(1, { duration: period / 2, easing: SINE }), withTiming(0, { duration: period / 2, easing: SINE })), -1, false));
  }, [running, period, v]);
  return v;
}

/** One-shot 0 → 1 entrance when `active` (instant under reduced motion), back to 0 when not. */
export function useEntrance(active: boolean, reduced: boolean, duration = 900, delay = 0) {
  const v = useSharedValue(active && reduced ? 1 : 0);
  useEffect(() => {
    if (!active) {
      v.set(0);
      return;
    }
    if (reduced) {
      v.set(1);
      return;
    }
    v.set(0);
    const t = setTimeout(() => v.set(withTiming(1, { duration, easing: EASE_OUT })), delay);
    return () => clearTimeout(t);
  }, [active, reduced, duration, delay, v]);
  return v;
}

/** Piecewise helpers for worklets: 0→1 progress of [a, b] within a cycle value. */
export function span(p: number, a: number, b: number) {
  'worklet';
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

/** Ease-out cubic, for worklets. */
export function easeOut(x: number) {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}

/** An orbit angle (rad) that laps every `lapMs` while `running` and glides to a stop after. */
export function useOrbitAngle(running: boolean, lapMs: number) {
  const angle = useSharedValue(0);
  useEffect(() => {
    if (!running) {
      cancelAnimation(angle);
      angle.set(withTiming(angle.get() + (Math.PI * 2 * 1200) / lapMs / 2, { duration: 1200, easing: EASE_OUT }));
      return;
    }
    const from = angle.get();
    angle.set(withRepeat(withTiming(from + Math.PI * 2, { duration: lapMs, easing: Easing.linear }), -1, false));
  }, [running, lapMs, angle]);
  return angle;
}
