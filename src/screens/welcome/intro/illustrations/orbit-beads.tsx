import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import type { ArtPalette } from './art-palette';
import { ellipseHalf, orbitXY } from './orbit-path';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export type Orbit = { rx: number; ry: number; deg: number; beads: number; phase: number; speed: number; size: number };

/**
 * One half of an orbit (the far half behind the orb, or the near half in front), with the
 * service beads currently on that half. Each bead exists in both halves and shows in the one
 * it's on, so it passes behind and in front of the orb. `angle` drives all beads (UI thread).
 */
export function OrbitHalf({ id, cx, cy, o, near, angle, p, reveal }: { id: string; cx: number; cy: number; o: Orbit; near: boolean; angle: SharedValue<number>; p: ArtPalette; reveal?: SharedValue<number> }) {
  const line = useAnimatedProps(() => ({ strokeOpacity: p.lineOpacity * (near ? 1 : 0.55) * (reveal ? reveal.get() : 1) }));
  return (
    <G>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={p.bright} stopOpacity={p.dark ? 0.9 : 0.5} />
          <Stop offset="1" stopColor={p.bright} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <G transform={`translate(${cx} ${cy}) rotate(${o.deg})`}>
        <AnimatedPath d={ellipseHalf(o.rx, o.ry, near)} stroke={p.line} strokeWidth={1} fill="none" animatedProps={line} />
      </G>
      {Array.from({ length: o.beads }, (_, i) => (
        <Bead key={i} glow={id} cx={cx} cy={cy} o={o} i={i} near={near} angle={angle} p={p} reveal={reveal} />
      ))}
    </G>
  );
}

function Bead({ glow, cx, cy, o, i, near, angle, p, reveal }: { glow: string; cx: number; cy: number; o: Orbit; i: number; near: boolean; angle: SharedValue<number>; p: ArtPalette; reveal?: SharedValue<number> }) {
  const halo = useAnimatedProps(() => {
    const a = o.phase + (i * Math.PI * 2) / o.beads + angle.get() * o.speed;
    const q = orbitXY(cx, cy, o.rx, o.ry, o.deg, a);
    const on = q.near === near ? 1 : 0;
    const k = reveal ? Math.min(1, Math.max(0, reveal.get() * (o.beads + 2) - i - 1)) : 1;
    return { cx: q.x, cy: q.y, opacity: on * k * (near ? 1 : 0.5), r: o.size * 3.2 * (1 + q.depth * 0.15) };
  });
  const core = useAnimatedProps(() => {
    const a = o.phase + (i * Math.PI * 2) / o.beads + angle.get() * o.speed;
    const q = orbitXY(cx, cy, o.rx, o.ry, o.deg, a);
    const on = q.near === near ? 1 : 0;
    const k = reveal ? Math.min(1, Math.max(0, reveal.get() * (o.beads + 2) - i - 1)) : 1;
    return { cx: q.x, cy: q.y, opacity: on * k * (near ? 1 : 0.6), r: o.size * (1 + q.depth * 0.15) * (0.4 + 0.6 * k) };
  });
  return (
    <G>
      <AnimatedCircle animatedProps={halo} fill={`url(#${glow})`} />
      <AnimatedCircle animatedProps={core} fill={p.bead} />
    </G>
  );
}
