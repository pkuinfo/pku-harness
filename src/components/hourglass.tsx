import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';

import { useT } from '@/i18n';
import { curves, useTheme } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);

const FLIP_MS = 360;
/** One grain spacing (viewBox units) and how long a grain takes to fall it. */
const GRAIN = 3;
const GRAIN_MS = 220;

/**
 * An hourglass whose sand drains over a fixed period aligned to Unix time (e.g. a 30 s TOTP
 * window: boundaries at multiples of `period` seconds since the epoch), flipping at each
 * boundary. Sand runs on the UI thread (Reanimated); a JS timer re-syncs at every boundary and
 * when the app returns to the foreground, so it never drifts from the clock.
 */
export function Hourglass({ period = 30, size = 56, tone = 'accent' }: { period?: number; size?: number; tone?: 'accent' | 'up' | 'down' | 'warn' }) {
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const sand = tone === 'up' ? c.up : tone === 'down' ? c.down : tone === 'warn' ? c.warn : c.accent;
  const p = useSharedValue(0); // 0 = top full, 1 = bottom full
  const turn = useSharedValue(0); // degrees, 0 → 180 during a flip
  // Falling grains: the stream is dashed and its offset loops, so the glass visibly runs even
  // though the sand level only moves 1/30 of the way per second.
  const fall = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    fall.set(withRepeat(withTiming(-GRAIN, { duration: GRAIN_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(fall);
  }, [reduced, fall]);

  useEffect(() => {
    const periodMs = period * 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const elapsed = () => Date.now() % periodMs;

    /** Jump to where the clock is and drain linearly to the next boundary. */
    const sync = () => {
      const e = elapsed();
      cancelAnimation(p);
      cancelAnimation(turn);
      turn.set(0);
      p.set(withSequence(withTiming(e / periodMs, { duration: 0 }), withTiming(1, { duration: periodMs - e, easing: Easing.linear })));
      schedule();
    };
    /** At the boundary: flip (bottom full becomes top full), then drain the new window. */
    const flip = () => {
      const e = elapsed(); // a few ms into the new window
      if (reduced) {
        p.set(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: Math.max(0, periodMs - e), easing: Easing.linear })));
      } else {
        turn.set(withSequence(withTiming(180, { duration: FLIP_MS, easing: Easing.bezier(...curves.inOut) }), withTiming(0, { duration: 0 })));
        p.set(withSequence(withTiming(1, { duration: FLIP_MS }), withTiming(0, { duration: 0 }), withTiming(1, { duration: Math.max(0, periodMs - e - FLIP_MS), easing: Easing.linear })));
      }
      schedule();
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(flip, periodMs - elapsed() + 5);
    };

    sync();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
      else clearTimeout(timer);
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
      cancelAnimation(p);
      cancelAnimation(turn);
    };
  }, [period, reduced, p, turn]);

  // Geometry (viewBox 0 0 40 56): bulbs are triangles meeting at the neck.
  const L = 7;
  const R = 33;
  const TOP = 6;
  const MID = 28;
  const BOT = 50;
  const H = MID - TOP;

  // Volume of a triangle grows with height², so the empty/full height is sqrt of the fraction.
  const topSand = useAnimatedProps(() => {
    const h = H * Math.sqrt(Math.max(0, 1 - p.get()));
    const half = ((R - L) / 2) * (h / H);
    const y = MID - h;
    return { d: h < 0.2 ? 'M20 28Z' : `M${20 - half} ${y} L${20 + half} ${y} L20 ${MID} Z` };
  });
  const bottomSand = useAnimatedProps(() => {
    const empty = H * Math.sqrt(Math.max(0, 1 - p.get()));
    const half = ((R - L) / 2) * (empty / H);
    const y = MID + empty;
    return { d: empty > H - 0.2 ? 'M20 50Z' : `M${20 - half} ${y} L${20 + half} ${y} L${R} ${BOT} L${L} ${BOT} Z` };
  });
  const stream = useAnimatedProps(() => {
    const v = p.get();
    const y = MID + H * Math.sqrt(Math.max(0, 1 - v));
    return { y2: y, strokeDashoffset: fall.get(), strokeOpacity: v > 0.002 && v < 0.998 ? 1 : 0 };
  });
  const flipStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));

  return (
    <View style={{ width: size * (40 / 56), height: size }} accessibilityRole="progressbar" accessibilityLabel={t('app.ui.countdown')}>
      <Animated.View style={[{ flex: 1 }, flipStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 40 56">
          <AnimatedPath animatedProps={topSand} fill={sand} />
          <AnimatedPath animatedProps={bottomSand} fill={sand} />
          <AnimatedLine animatedProps={stream} x1={20} y1={MID} x2={20} stroke={sand} strokeWidth={1.4} strokeLinecap="round" strokeDasharray={reduced ? undefined : [0.01, GRAIN]} />
          {/* Glass: two bulbs and the end caps. */}
          <Path d={`M${L} ${TOP} L${R} ${TOP} L20.8 ${MID} L${R} ${BOT} L${L} ${BOT} L19.2 ${MID} Z`} fill="none" stroke={c.textFaint} strokeWidth={1.4} strokeLinejoin="round" />
          <Line x1={4} y1={TOP} x2={36} y2={TOP} stroke={c.textMuted} strokeWidth={2.4} strokeLinecap="round" />
          <Line x1={4} y1={BOT} x2={36} y2={BOT} stroke={c.textMuted} strokeWidth={2.4} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}
