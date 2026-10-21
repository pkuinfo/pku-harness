import { View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Ellipse, G } from 'react-native-svg';

import type { IconName } from '@/components/icon';
import { spacing } from '@/theme';

import { useArtPalette, useSvgId } from './art-palette';
import { OrbGlyph } from './orb-glyph';
import { OrbitNode } from './orbit-node';
import { useBreath, useEntrance, useOrbitAngle } from './use-art-drivers';
import { useArtLoop } from './use-art-loop';

const VB = { w: 320, h: 240 };
const C = { x: 160, y: 120 };
const ORBITS = [
  { rx: 132, ry: 50, deg: -8, speed: 1 },
  { rx: 90, ry: 80, deg: 22, speed: -0.6 },
];
const NODES: { icon: IconName; orbit: number; phase: number }[] = [
  { icon: 'card', orbit: 0, phase: 0.3 },
  { icon: 'book', orbit: 0, phase: 1.9 },
  { icon: 'wifi', orbit: 0, phase: 3.4 },
  { icon: 'globe', orbit: 0, phase: 4.9 },
  { icon: 'todo', orbit: 1, phase: 0.9 },
  { icon: 'calendar', orbit: 1, phase: 3.0 },
];
/** The community plugin that docks in when the page opens. */
const DOCK = { icon: 'puzzle' as IconName, orbit: 1, phase: 5.0, from: { x: 300, y: 8 } };

/**
 * 一切皆插件: every capability is a plugin circling the same agent, built-in and community alike.
 * The services orbit the orb (far ones smaller and dimmer); a community plugin flies in and
 * takes its place among them. Orbits lap on the UI thread within a budget, then glide to rest.
 */
export function PluginArt({ active }: { active: boolean }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - spacing.xxl * 2, 360);
  const s = w / VB.w;
  const p = useArtPalette();
  const id = useSvgId('plug');
  const reduced = useReducedMotion();
  const running = useArtLoop(active, 14_000);
  const angle = useOrbitAngle(running, 36_000);
  const breath = useBreath(running);
  const dock = useEntrance(active, reduced, 1300, 500);
  const node = Math.round(30 * s);

  return (
    <View style={{ width: w, height: VB.h * s }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={VB.h * s} viewBox={`0 0 ${VB.w} ${VB.h}`}>
        {ORBITS.map((o, i) => (
          <G key={i} transform={`translate(${C.x} ${C.y}) rotate(${o.deg})`}>
            <Ellipse cx={0} cy={0} rx={o.rx} ry={o.ry} stroke={p.line} strokeOpacity={p.lineOpacity} strokeWidth={1} fill="none" strokeDasharray={i ? '2 5' : undefined} />
          </G>
        ))}
        <OrbGlyph id={id} cx={C.x} cy={C.y} r={30} p={p} pulse={breath} />
      </Svg>
      {NODES.map((n) => {
        const o = ORBITS[n.orbit];
        return <OrbitNode key={n.icon} cx={C.x} cy={C.y} rx={o.rx} ry={o.ry} deg={o.deg} phase={n.phase} speed={o.speed} angle={angle} scale={s} size={node} icon={n.icon} p={p} />;
      })}
      <OrbitNode
        cx={C.x}
        cy={C.y}
        rx={ORBITS[DOCK.orbit].rx}
        ry={ORBITS[DOCK.orbit].ry}
        deg={ORBITS[DOCK.orbit].deg}
        phase={DOCK.phase}
        speed={ORBITS[DOCK.orbit].speed}
        angle={angle}
        scale={s}
        size={node}
        icon={DOCK.icon}
        p={p}
        dock={dock}
        from={DOCK.from}
        accent
      />
    </View>
  );
}
