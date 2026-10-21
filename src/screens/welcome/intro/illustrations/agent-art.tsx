import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

import { useArtPalette, useSvgId } from './art-palette';
import { Beam } from './beam';
import { GlassNode } from './glass-node';
import { OrbGlyph } from './orb-glyph';
import { easeOut, span, useBreath, useCycle } from './use-art-drivers';
import { useArtLoop } from './use-art-loop';

const VB = { w: 320, h: 240 };
const ORB = { x: 86, y: 124, r: 30 };
const NODES = [
  { x: 214, y: 92, icon: 'card' as const, at: 0.46 },
  { x: 250, y: 136, icon: 'alarm' as const, at: 0.5 },
  { x: 214, y: 180, icon: 'bell' as const, at: 0.54 },
];
/** The frame that tells the story (and the reduced-motion frame): everything done. */
const REST = 0.9;

/**
 * 对话即操作: you say one sentence, the agent (the orb) takes it in, reaches out to the campus
 * services it needs, and comes back with the result. One story clock drives every beat on
 * the UI thread; it plays a few times, then rests on the finished frame.
 */
export function AgentArt({ active }: { active: boolean }) {
  const tr = useT();
  const { width } = useWindowDimensions();
  const w = Math.min(width - spacing.xxl * 2, 360);
  const s = w / VB.w;
  const p = useArtPalette();
  const id = useSvgId('agent');
  const running = useArtLoop(active, 16_000);
  const t = useCycle(running, { duration: 5200, rest: REST });
  const breath = useBreath(running);
  // Hide everything again at the very end of a cycle, so the next one starts clean.
  const out = useDerivedValue(() => 1 - span(t.get(), 0.95, 1));

  const bubble = useAnimatedStyle(() => {
    const k = easeOut(span(t.get(), 0.02, 0.14));
    return { opacity: k * out.get(), transform: [{ translateY: (1 - k) * 10 }] };
  });
  const chip = useAnimatedStyle(() => {
    const k = easeOut(span(t.get(), 0.62, 0.74));
    return { opacity: k * out.get(), transform: [{ translateY: (1 - k) * 8 }, { scale: 0.96 + 0.04 * k }] };
  });
  const lit = [
    useDerivedValue(() => span(t.get(), NODES[0].at + 0.1, NODES[0].at + 0.16) * out.get()),
    useDerivedValue(() => span(t.get(), NODES[1].at + 0.1, NODES[1].at + 0.16) * out.get()),
    useDerivedValue(() => span(t.get(), NODES[2].at + 0.1, NODES[2].at + 0.16) * out.get()),
  ];

  return (
    <View style={{ width: w, height: VB.h * s }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={VB.h * s} viewBox={`0 0 ${VB.w} ${VB.h}`}>
        <Beam a={{ x: 196, y: 50 }} via={{ x: 130, y: 58 }} b={{ x: ORB.x + 18, y: ORB.y - 26 }} p={t} from={0.14} to={0.3} pal={p} fade={[0.95, 1]} />
        {NODES.map((n) => (
          <Beam key={n.icon} a={{ x: ORB.x + ORB.r + 4, y: ORB.y }} via={{ x: (ORB.x + n.x) / 2 + 8, y: (ORB.y + n.y) / 2 }} b={{ x: n.x - 18, y: n.y }} p={t} from={n.at} to={n.at + 0.1} pal={p} fade={[0.95, 1]} />
        ))}
        <OrbGlyph id={id} cx={ORB.x} cy={ORB.y} r={ORB.r} p={p} pulse={breath} />
      </Svg>
      {NODES.map((n, i) => (
        <GlassNode key={n.icon} x={n.x} y={n.y} scale={s} size={Math.round(34 * s)} icon={n.icon} p={p} lit={lit[i]} />
      ))}
      <Animated.View className="absolute self-end rounded-xl rounded-br-sm bg-brand px-4 py-2" style={[{ top: 12 * s, right: 8 * s, borderCurve: 'continuous' }, bubble]}>
        <Text variant="callout" tone="onAccent" numberOfLines={1}>
          {tr('welcome.art.agentAsk')}
        </Text>
      </Animated.View>
      <Animated.View
        className="absolute flex-row items-center gap-2 rounded-lg border-[0.5px] px-3 py-2"
        style={[{ left: 18 * s, bottom: 4 * s, borderCurve: 'continuous', backgroundColor: p.cardFill, borderColor: p.cardEdge }, chip]}>
        <Icon name="check" size={14} color={p.accent} />
        <Text variant="caption" numberOfLines={1}>
          {tr('welcome.art.agentDone')}
        </Text>
      </Animated.View>
    </View>
  );
}
