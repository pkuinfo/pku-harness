import { View, useWindowDimensions } from 'react-native';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import Svg, { Ellipse, G } from 'react-native-svg';

import type { IconName } from '@/components/icon';
import { spacing } from '@/theme';

import { useArtPalette, useSvgId } from './art-palette';
import { Beam } from './beam';
import { GlassNode } from './glass-node';
import { OrbGlyph } from './orb-glyph';
import { span, useBreath, useEntrance } from './use-art-drivers';
import { useArtLoop } from './use-art-loop';

const VB = { w: 300, h: 120 };
const ORB = { x: 70, y: 60 };
const TILES: { x: number; y: number; icon: IconName }[] = [
  { x: 176, y: 36, icon: 'card' },
  { x: 220, y: 36, icon: 'book' },
  { x: 264, y: 36, icon: 'wifi' },
  { x: 176, y: 84, icon: 'todo' },
  { x: 220, y: 84, icon: 'globe' },
  { x: 264, y: 84, icon: 'puzzle' },
];
/** The tile that gets switched on. */
const ON = 1;

/**
 * Step header · 选择插件: the agent on the left, the plugins as a grid of tiles; one is
 * switched on and connects to it. One entrance on the UI thread.
 */
export function StepPluginsArt() {
  const { width } = useWindowDimensions();
  const w = Math.min(width - spacing.xxl * 2, 340);
  const s = w / VB.w;
  const p = useArtPalette();
  const id = useSvgId('stepplug');
  const reduced = useReducedMotion();
  const e = useEntrance(true, reduced, 1500, 200);
  const breath = useBreath(useArtLoop(true, 8_000));
  const lit = useDerivedValue(() => span(e.get(), 0.75, 0.95));
  return (
    <View style={{ width: w, height: VB.h * s }} className="self-center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={VB.h * s} viewBox={`0 0 ${VB.w} ${VB.h}`}>
        <G transform={`translate(${ORB.x} ${ORB.y}) rotate(-10)`}>
          <Ellipse cx={0} cy={0} rx={48} ry={15} stroke={p.line} strokeOpacity={p.lineOpacity} strokeWidth={1} fill="none" />
        </G>
        <Beam a={{ x: ORB.x + 30, y: ORB.y - 4 }} via={{ x: 150, y: 20 }} b={{ x: TILES[ON].x - 4, y: TILES[ON].y - 18 }} p={e} from={0.35} to={0.8} pal={p} />
        <OrbGlyph id={id} cx={ORB.x} cy={ORB.y} r={24} p={p} pulse={breath} />
      </Svg>
      {TILES.map((t, i) => (
        <GlassNode key={t.icon} x={t.x} y={t.y} scale={s} size={Math.round(32 * s)} icon={t.icon} p={p} shape="square" lit={i === ON ? lit : undefined} />
      ))}
    </View>
  );
}
