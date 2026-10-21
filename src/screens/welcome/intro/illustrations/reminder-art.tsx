import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedProps, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { spacing } from '@/theme';

import { useArtPalette, useSvgId, type ArtPalette } from './art-palette';
import { span, useCycle } from './use-art-drivers';
import { useArtLoop } from './use-art-loop';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const VB = { w: 320, h: 240 };
const C = { x: 160, y: 120 };
const DIAL = 74;
const RING = 98;
const COUNT = 16;
/** Arc the 16 occurrences span (rad), starting at 12 o'clock, clockwise. */
const SWEEP = (Math.PI * 2 * 15) / 16;
const START = -Math.PI / 2;
const CIRC = 2 * Math.PI * RING;
const REST = 0.9;

const ease = (x: number) => {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/**
 * 提醒: "every 3 days, 16 times". A quiet dial; around it the series as 16 beads, and the agent
 * (a small orb) travelling the ring, lighting each occurrence as it's delivered. Plays a few
 * times on the UI thread, then rests with the series complete.
 */
export function ReminderArt({ active }: { active: boolean }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - spacing.xxl * 2, 360);
  const s = w / VB.w;
  const p = useArtPalette();
  const id = useSvgId('remind');
  const running = useArtLoop(active, 14_000);
  const t = useCycle(running, { duration: 6400, rest: REST });
  const prog = useDerivedValue(() => ease(span(t.get(), 0.06, 0.84)));
  const out = useDerivedValue(() => 1 - span(t.get(), 0.94, 1));

  const trail = useAnimatedProps(() => ({ strokeDashoffset: CIRC * (1 - (prog.get() * SWEEP) / (Math.PI * 2)), strokeOpacity: (p.dark ? 0.55 : 0.5) * out.get() }));
  const agent = useAnimatedProps(() => {
    const a = START + prog.get() * SWEEP;
    return { cx: C.x + RING * Math.cos(a), cy: C.y + RING * Math.sin(a), opacity: out.get() };
  });
  const agentHalo = useAnimatedProps(() => {
    const a = START + prog.get() * SWEEP;
    return { cx: C.x + RING * Math.cos(a), cy: C.y + RING * Math.sin(a), opacity: out.get() };
  });

  return (
    <View style={{ width: w, height: VB.h * s }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={VB.h * s} viewBox={`0 0 ${VB.w} ${VB.h}`}>
        <Defs>
          <RadialGradient id={`${id}d`} cx="50%" cy="50%" r="50%">
            <Stop offset="0.7" stopColor={p.bright} stopOpacity={0} />
            <Stop offset="1" stopColor={p.bright} stopOpacity={p.dark ? 0.12 : 0.06} />
          </RadialGradient>
          <RadialGradient id={`${id}h`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={p.bright} stopOpacity={p.dark ? 0.85 : 0.45} />
            <Stop offset="1" stopColor={p.bright} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={C.x} cy={C.y} r={RING} stroke={p.line} strokeOpacity={p.lineOpacity * 0.6} strokeWidth={1} fill="none" />
        <G transform={`rotate(-90 ${C.x} ${C.y})`}>
          <AnimatedCircle cx={C.x} cy={C.y} r={RING} stroke={p.bright} strokeWidth={1.6} strokeLinecap="round" fill="none" strokeDasharray={[CIRC, CIRC]} animatedProps={trail} />
        </G>
        <Circle cx={C.x} cy={C.y} r={DIAL} fill={p.cardFill} stroke={p.cardEdge} strokeWidth={0.75} />
        <Circle cx={C.x} cy={C.y} r={DIAL} fill={`url(#${id}d)`} />
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const major = i % 5 === 0;
          const r0 = DIAL - (major ? 9 : 6);
          const r1 = DIAL - 4;
          return (
            <Line
              key={i}
              x1={C.x + r0 * Math.cos(a)}
              y1={C.y + r0 * Math.sin(a)}
              x2={C.x + r1 * Math.cos(a)}
              y2={C.y + r1 * Math.sin(a)}
              stroke={p.text}
              strokeOpacity={major ? 0.3 : 0.12}
              strokeWidth={major ? 1.2 : 0.8}
              strokeLinecap="round"
            />
          );
        })}
        {Array.from({ length: COUNT }, (_, i) => (
          <Occurrence key={i} i={i} prog={prog} out={out} p={p} glow={`${id}h`} />
        ))}
        <AnimatedCircle r={14} fill={`url(#${id}h)`} animatedProps={agentHalo} />
        <AnimatedCircle r={6} fill={p.dark ? p.hot : p.core} stroke={p.page} strokeWidth={1.5} animatedProps={agent} />
      </Svg>
      <View className="absolute inset-0 items-center justify-center gap-1">
        <Icon name="alarm" size={16} color={p.accent} />
        <Text variant="numberL" style={{ fontVariant: ['tabular-nums'] }}>
          08:00
        </Text>
        <Text variant="caption" tone="muted">
          每 3 天 · 共 16 次
        </Text>
      </View>
    </View>
  );
}

function Occurrence({ i, prog, out, p, glow }: { i: number; prog: SharedValue<number>; out: SharedValue<number>; p: ArtPalette; glow: string }) {
  const a = START + (i / (COUNT - 1)) * SWEEP;
  const x = C.x + RING * Math.cos(a);
  const y = C.y + RING * Math.sin(a);
  const at = i / (COUNT - 1);
  const lit = useAnimatedProps(() => ({ opacity: (prog.get() >= at - 0.001 ? 1 : 0) * out.get() }));
  return (
    <G>
      <Circle cx={x} cy={y} r={2.6} fill={p.track} stroke={p.line} strokeOpacity={p.lineOpacity} strokeWidth={0.75} />
      <AnimatedCircle cx={x} cy={y} r={7} fill={`url(#${glow})`} animatedProps={lit} />
      <AnimatedCircle cx={x} cy={y} r={2.8} fill={p.dark ? p.glow : p.core} animatedProps={lit} />
    </G>
  );
}
