import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import Svg, { Ellipse, G, Rect } from 'react-native-svg';

import { Text } from '@/components/text';
import { spacing } from '@/theme';

import { useArtPalette, useSvgId } from './art-palette';
import { Beam } from './beam';
import { GlassCard } from './glass-card';
import { GlassNode } from './glass-node';
import { OrbGlyph } from './orb-glyph';
import { span, useBreath, useEntrance } from './use-art-drivers';
import { useArtLoop } from './use-art-loop';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const VB = { w: 300, h: 120 };
const ORB = { x: 58, y: 64 };
/** The system alarm that wakes the app at the minute. */
const ALARM = { x: 128, y: 28 };
/** The notification it delivers. */
const CARD = { x: 156, y: 42, w: 132, h: 50, r: 14 };
const BELL = { x: CARD.x + 24, y: CARD.y + CARD.h / 2 };

/**
 * Step header · 让提醒准时送达: the agent (orb) hands the reminder to the system alarm, which
 * wakes on the minute and delivers it as a notification that lights up. One entrance on the UI
 * thread; under reduced motion it shows the delivered frame.
 */
export function StepPermissionsArt() {
  const { width } = useWindowDimensions();
  const w = Math.min(width - spacing.xxl * 2, 340);
  const s = w / VB.w;
  const p = useArtPalette();
  const id = useSvgId('stepperm');
  const reduced = useReducedMotion();
  const e = useEntrance(true, reduced, 1800, 200);
  const breath = useBreath(useArtLoop(true, 8_000));
  const alarmLit = useDerivedValue(() => span(e.get(), 0.38, 0.52));
  const delivered = useDerivedValue(() => span(e.get(), 0.78, 0.94));
  const ring = useAnimatedProps(() => ({ strokeOpacity: delivered.get() * (p.dark ? 0.7 : 0.6) }));
  const time = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * delivered.get() }));
  return (
    <View style={{ width: w, height: VB.h * s }} className="self-center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={VB.h * s} viewBox={`0 0 ${VB.w} ${VB.h}`}>
        <G transform={`translate(${ORB.x} ${ORB.y}) rotate(-12)`}>
          <Ellipse cx={0} cy={0} rx={44} ry={14} stroke={p.line} strokeOpacity={p.lineOpacity} strokeWidth={1} fill="none" />
        </G>
        <Beam a={{ x: ORB.x + 24, y: ORB.y - 10 }} via={{ x: 96, y: 26 }} b={{ x: ALARM.x - 16, y: ALARM.y }} p={e} from={0.12} to={0.4} pal={p} />
        <Beam a={{ x: ALARM.x + 14, y: ALARM.y + 8 }} via={{ x: 148, y: 40 }} b={{ x: CARD.x - 2, y: BELL.y }} p={e} from={0.5} to={0.8} pal={p} />
        <GlassCard id={`${id}card`} x={CARD.x} y={CARD.y} w={CARD.w} h={CARD.h} r={CARD.r} p={p} />
        <AnimatedRect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={CARD.r} fill="none" stroke={p.accent} strokeWidth={1} animatedProps={ring} />
        {/* The notification's body text, as two quiet bars. */}
        <Rect x={CARD.x + 48} y={CARD.y + 30} width={68} height={4} rx={2} fill={p.track} />
        <Rect x={CARD.x + 48} y={CARD.y + 38} width={44} height={4} rx={2} fill={p.track} />
        <OrbGlyph id={id} cx={ORB.x} cy={ORB.y} r={22} p={p} pulse={breath} />
      </Svg>
      <GlassNode x={ALARM.x} y={ALARM.y} scale={s} size={Math.round(28 * s)} icon="alarm" p={p} lit={alarmLit} />
      <GlassNode x={BELL.x} y={BELL.y} scale={s} size={Math.round(30 * s)} icon="bell" p={p} shape="square" lit={delivered} />
      <Animated.View className="absolute" style={[{ left: (CARD.x + 48) * s, top: (CARD.y + 8) * s }, time]}>
        <Text variant="micro" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          08:00
        </Text>
      </Animated.View>
    </View>
  );
}
