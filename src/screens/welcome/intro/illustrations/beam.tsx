import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { Circle, G, Path } from 'react-native-svg';

import type { ArtPalette } from './art-palette';
import { span } from './use-art-drivers';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Pt = { x: number; y: number };

function quad(a: Pt, c: Pt, b: Pt, t: number) {
  'worklet';
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/**
 * A connection in the illustrations: a faint track, a line that draws on over [from, to] of the
 * story clock `p`, and a spark travelling along it. Curved through `via` when given. All props
 * derive from `p` on the UI thread.
 */
export function Beam({ a, b, via, p, from, to, pal, fade }: { a: Pt; b: Pt; via?: Pt; p: SharedValue<number>; from: number; to: number; pal: ArtPalette; fade?: [number, number] }) {
  const c = via ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // Arc length by sampling (fine for a dash length).
  let len = 0;
  let prev = a;
  for (let i = 1; i <= 16; i++) {
    const q = quad(a, c, b, i / 16);
    len += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = q;
  }
  const d = `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
  const out = (v: number) => {
    'worklet';
    return fade ? 1 - span(v, fade[0], fade[1]) : 1;
  };
  const line = useAnimatedProps(() => {
    const k = span(p.get(), from, to);
    return { strokeDashoffset: len * (1 - k), strokeOpacity: (pal.dark ? 0.7 : 0.75) * out(p.get()) };
  });
  const spark = useAnimatedProps(() => {
    const k = span(p.get(), from, to);
    const q = quad(a, c, b, k);
    return { cx: q.x, cy: q.y, opacity: k > 0 && k < 1 ? 1 : 0 };
  });
  return (
    <G>
      <Path d={d} stroke={pal.line} strokeOpacity={pal.lineOpacity * 0.6} strokeWidth={1} fill="none" strokeDasharray="2 4" />
      <AnimatedPath d={d} stroke={pal.bright} strokeWidth={1.4} strokeLinecap="round" fill="none" strokeDasharray={[len, len]} animatedProps={line} />
      <AnimatedCircle r={2.6} fill={pal.dark ? pal.hot : pal.core} animatedProps={spark} />
    </G>
  );
}
