import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { brand } from '@/theme/brand';
import { springs, useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export type OrbitState = 'thinking' | 'tool' | 'writing' | 'rest';

/** Seconds per revolution and tail length (degrees) for each state. */
const MOTION: Record<Exclude<OrbitState, 'rest'>, { ms: number; tail: number }> = {
  thinking: { ms: 1500, tail: 55 },
  tool: { ms: 820, tail: 120 },
  writing: { ms: 1150, tail: 80 },
};

// viewBox 0 0 24 24: the logo's open orbit (its gap faces the stem, on the left), scaled down.
const C = 12;
const R = 8;
const START = brand.orbit.startDeg;
const END = brand.orbit.endDeg;
const HOME = brand.agent.deg;
const rad = (d: number) => (d * Math.PI) / 180;
const pt = (deg: number) => ({ x: C + R * Math.cos(rad(deg)), y: C + R * Math.sin(rad(deg)) });
const ORBIT = (() => {
  const a = pt(START);
  const b = pt(END);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 1 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
})();

/**
 * The agent at work, in the brand's own language: the logo's open orbit with the agent dot
 * travelling on it and a comet tail behind. Pace and tail say what it's doing (thinking, calling
 * a tool, writing); at rest the dot glides forward to its home in the logo and stops, so the
 * indicator settles into the mark. SVG + Reanimated on the UI thread (no Skia surface).
 */
export function AgentOrbit({ state, size = 18 }: { state: OrbitState; size?: number }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const angle = useSharedValue(state === 'rest' ? HOME : HOME - 90);
  const tail = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(angle);
    cancelAnimation(pulse);
    if (state === 'rest') {
      // Keep travelling forwards to home, never back.
      const at = angle.get();
      const rest = (((HOME - at) % 360) + 360) % 360;
      angle.set(withTiming(at + rest, { duration: 260 + rest * 2.5, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
      tail.set(withSpring(0, springs.smooth));
      pulse.set(withTiming(1, { duration: 200 }));
      return;
    }
    const m = MOTION[state];
    if (reduced) {
      angle.set(HOME);
      tail.set(0);
      pulse.set(withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false));
      return;
    }
    const from = angle.get();
    angle.set(withRepeat(withTiming(from + 360, { duration: m.ms, easing: Easing.linear }), -1, false));
    tail.set(withSpring(m.tail, springs.smooth));
  }, [state, reduced, angle, tail, pulse]);

  const dot = useAnimatedProps(() => {
    const a = (angle.get() * Math.PI) / 180;
    return { cx: C + R * Math.cos(a), cy: C + R * Math.sin(a), opacity: pulse.get() };
  });
  const comet = useAnimatedProps(() => {
    const t = tail.get();
    if (t < 2) return { d: 'M 0 0', strokeOpacity: 0 };
    const a2 = (angle.get() * Math.PI) / 180;
    const a1 = ((angle.get() - t) * Math.PI) / 180;
    const x1 = C + R * Math.cos(a1);
    const y1 = C + R * Math.sin(a1);
    const x2 = C + R * Math.cos(a2);
    const y2 = C + R * Math.sin(a2);
    return { d: `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`, strokeOpacity: 0.45 };
  });

  const resting = state === 'rest';
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={ORBIT} fill="none" stroke={resting ? c.textMuted : c.textFaint} strokeWidth={resting ? 2.6 : 2} strokeLinecap="round" />
        <AnimatedPath animatedProps={comet} fill="none" stroke={c.accent} strokeWidth={2.6} strokeLinecap="round" />
        {/* The dot sits in a cut-out like the logo's: a page-coloured halo, then the dot. */}
        <AnimatedCircle animatedProps={dot} r={3.6} fill={c.bg} />
        <AnimatedCircle animatedProps={dot} r={2.5} fill={c.accent} />
      </Svg>
    </View>
  );
}
