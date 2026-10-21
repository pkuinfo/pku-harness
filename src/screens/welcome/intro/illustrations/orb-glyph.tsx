import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { Circle, Defs, Ellipse, G, LinearGradient, Pattern, RadialGradient, Stop } from 'react-native-svg';

import type { ArtPalette } from './art-palette';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The agent orb in 2D, drawn to match the 3D hero: a red glass sphere lit from inside (radial
 * body gradient with a hot core low in the glass), a back-lit rim, a studio window highlight,
 * a soft halo, and a faint dot matrix over the glass (the Siri-orb texture from 21st.dev,
 * standing in for the shader's grain). On the light page it sits on a warm contact shadow.
 * Embed inside an <Svg>; `pulse` (0..1) breathes the inner light on the UI thread.
 */
export function OrbGlyph({ id, cx, cy, r, p, pulse, halo = true }: { id: string; cx: number; cy: number; r: number; p: ArtPalette; pulse?: SharedValue<number>; halo?: boolean }) {
  const core = useAnimatedProps(() => {
    const v = pulse ? pulse.get() : 0.6;
    return { opacity: 0.55 + 0.45 * v, r: r * (0.5 + 0.08 * v) };
  });
  const glow = useAnimatedProps(() => {
    const v = pulse ? pulse.get() : 0.6;
    return { opacity: 0.75 + 0.25 * v };
  });
  const dot = Math.max(1.6, r / 9);
  return (
    <G>
      <Defs>
        <RadialGradient id={`${id}h`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={p.bright} stopOpacity={p.haloOpacity} />
          <Stop offset="0.45" stopColor={p.bright} stopOpacity={p.haloOpacity * 0.35} />
          <Stop offset="1" stopColor={p.bright} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}b`} cx="50%" cy="58%" r="58%" fx="52%" fy="66%">
          <Stop offset="0" stopColor={p.hot} />
          <Stop offset="0.2" stopColor={p.bright} />
          <Stop offset="0.62" stopColor={p.core} />
          <Stop offset="1" stopColor={p.shade} />
        </RadialGradient>
        <RadialGradient id={`${id}r`} cx="50%" cy="50%" r="50%">
          <Stop offset="0.74" stopColor={p.dark ? p.bright : p.white} stopOpacity={0} />
          <Stop offset="0.94" stopColor={p.dark ? p.glow : p.white} stopOpacity={p.dark ? 0.55 : 0.42} />
          <Stop offset="1" stopColor={p.dark ? p.glow : p.white} stopOpacity={0.1} />
        </RadialGradient>
        <RadialGradient id={`${id}c`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={p.hot} stopOpacity={0.95} />
          <Stop offset="1" stopColor={p.bright} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.white} stopOpacity={0.9} />
          <Stop offset="1" stopColor={p.white} stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id={`${id}g`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={p.deep} stopOpacity={p.shadowOpacity} />
          <Stop offset="1" stopColor={p.deep} stopOpacity={0} />
        </RadialGradient>
        <Pattern id={`${id}d`} patternUnits="userSpaceOnUse" width={dot * 2.4} height={dot * 2.4}>
          <Circle cx={dot * 1.2} cy={dot * 1.2} r={dot * 0.32} fill={p.white} />
        </Pattern>
      </Defs>
      {p.shadowOpacity > 0 ? <Ellipse cx={cx} cy={cy + r * 1.18} rx={r * 0.95} ry={r * 0.2} fill={`url(#${id}g)`} /> : null}
      {halo ? <AnimatedCircle animatedProps={glow} cx={cx} cy={cy} r={r * 2.1} fill={`url(#${id}h)`} /> : null}
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${id}b)`} />
      <AnimatedCircle animatedProps={core} cx={cx + r * 0.04} cy={cy + r * 0.16} fill={`url(#${id}c)`} />
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${id}d)`} opacity={p.dark ? 0.07 : 0.1} />
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${id}r)`} />
      <Ellipse cx={cx - r * 0.3} cy={cy - r * 0.46} rx={r * 0.4} ry={r * 0.2} fill={`url(#${id}s)`} transform={`rotate(-24 ${cx - r * 0.3} ${cy - r * 0.46})`} />
    </G>
  );
}
