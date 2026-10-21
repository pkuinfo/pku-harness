import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

import { useArtPalette, useSvgId } from './art-palette';
import { GlassCard } from './glass-card';
import { OrbGlyph } from './orb-glyph';
import { easeOut, span, useBreath, useEntrance } from './use-art-drivers';
import { useArtLoop } from './use-art-loop';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const VB = { w: 320, h: 240 };
// A week of card spending (balance after each day), for the trend line.
const TREND = [168, 161, 158, 149, 152, 140, 136, 131, 133, 128.4];
const LINE = { x: 40, y: 92, w: 236, h: 36 };
const GAUGE = { x: 58, y: 192, r: 20, value: 0.72 };
const BARS = [0.42, 0.66, 0.5, 0.86, 0.72, 0.58];

function trendPath() {
  const min = Math.min(...TREND);
  const max = Math.max(...TREND);
  const pts = TREND.map((v, i) => [LINE.x + (i / (TREND.length - 1)) * LINE.w, LINE.y + (1 - (v - min) / (max - min)) * LINE.h] as const);
  // Smooth with midpoint quadratics.
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
  }
  const last = pts[pts.length - 1];
  d += ` T ${last[0]} ${last[1]}`;
  return { d, area: `${d} L ${last[0]} ${LINE.y + LINE.h + 8} L ${LINE.x} ${LINE.y + LINE.h + 8} Z`, end: last };
}
const TRENDP = trendPath();
const TREND_LEN = 300;
const ARC = 2 * Math.PI * GAUGE.r;

/**
 * 看板: the numbers you asked the agent to watch, assembled for you. The orb that built it
 * hovers at the corner; on arrival the trend draws on, the gauge fills and the bars rise.
 * One entrance (UI thread), then only the orb breathes, within a budget.
 */
export function DashboardArt({ active }: { active: boolean }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const w = Math.min(width - spacing.xxl * 2, 360);
  const s = w / VB.w;
  const p = useArtPalette();
  const id = useSvgId('dash');
  const reduced = useReducedMotion();
  const e = useEntrance(active, reduced, 1700, 120);
  const breath = useBreath(useArtLoop(active, 10_000));

  const line = useAnimatedProps(() => ({ strokeDashoffset: TREND_LEN * (1 - easeOut(span(e.get(), 0.15, 0.85))) }));
  const area = useAnimatedProps(() => ({ opacity: easeOut(span(e.get(), 0.45, 1)) }));
  const endDot = useAnimatedProps(() => ({ opacity: span(e.get(), 0.8, 0.9) }));
  const gauge = useAnimatedProps(() => ({ strokeDashoffset: ARC * (1 - GAUGE.value * easeOut(span(e.get(), 0.25, 0.9))) }));
  const cards = useAnimatedStyle(() => {
    const k = easeOut(span(e.get(), 0, 0.5));
    return { opacity: k, transform: [{ translateY: (1 - k) * 12 }] };
  });

  return (
    <View style={{ width: w, height: VB.h * s }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ flex: 1 }, cards]}>
        <Svg width={w} height={VB.h * s} viewBox={`0 0 ${VB.w} ${VB.h}`}>
          <Defs>
            <LinearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.bright} stopOpacity={p.dark ? 0.34 : 0.2} />
              <Stop offset="1" stopColor={p.bright} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <GlassCard id={`${id}c1`} x={24} y={20} w={272} h={124} r={20} p={p} />
          <GlassCard id={`${id}c2`} x={24} y={154} w={128} h={78} r={18} p={p} />
          <GlassCard id={`${id}c3`} x={162} y={154} w={134} h={78} r={18} p={p} />

          <AnimatedPath d={TRENDP.area} fill={`url(#${id}a)`} animatedProps={area} />
          <AnimatedPath d={TRENDP.d} stroke={p.dark ? p.bright : p.core} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={[TREND_LEN, TREND_LEN]} animatedProps={line} />
          <AnimatedCircle cx={TRENDP.end[0]} cy={TRENDP.end[1]} r={3.5} fill={p.dark ? p.hot : p.core} stroke={p.page} strokeWidth={1.5} animatedProps={endDot} />

          <Circle cx={GAUGE.x} cy={GAUGE.y} r={GAUGE.r} stroke={p.track} strokeWidth={5} fill="none" />
          <G transform={`rotate(-90 ${GAUGE.x} ${GAUGE.y})`}>
            <AnimatedCircle cx={GAUGE.x} cy={GAUGE.y} r={GAUGE.r} stroke={p.dark ? p.bright : p.core} strokeWidth={5} strokeLinecap="round" fill="none" strokeDasharray={[ARC, ARC]} animatedProps={gauge} />
          </G>

          {BARS.map((v, i) => (
            <Bar key={i} i={i} v={v} e={e} color={i === 3 ? (p.dark ? p.bright : p.core) : p.track} />
          ))}

          <OrbGlyph id={`${id}o`} cx={282} cy={26} r={11} p={p} pulse={breath} />
        </Svg>
        <View className="absolute gap-0.5" style={{ left: 40 * s, top: 34 * s }}>
          <Text variant="caption" tone="muted">
            {t('welcome.art.cardBalance')}
          </Text>
          <Text variant="numberL">¥128.40</Text>
        </View>
        <View className="absolute gap-0.5" style={{ left: 88 * s, top: 172 * s }}>
          <Text variant="caption" tone="muted">
            {t('welcome.art.netFee')}
          </Text>
          <Text variant="bodyStrong">¥36</Text>
        </View>
        <View className="absolute gap-0.5" style={{ left: 176 * s, top: 164 * s }}>
          <Text variant="caption" tone="muted">
            {t('welcome.art.weekLabel')}
          </Text>
          <Text variant="bodyStrong">{t('welcome.art.weekValue')}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function Bar({ i, v, e, color }: { i: number; v: number; e: ReturnType<typeof useEntrance>; color: string }) {
  const x = 236 + i * 9;
  const base = 220;
  const max = 52;
  const props = useAnimatedProps(() => {
    const k = easeOut(span(e.get(), 0.3 + i * 0.06, 0.75 + i * 0.04));
    const h = Math.max(2, v * max * k);
    return { y: base - h, height: h };
  });
  return <AnimatedRect x={x} width={5} rx={2.5} fill={color} animatedProps={props} />;
}
