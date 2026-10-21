import { View, useWindowDimensions } from 'react-native';
import Svg from 'react-native-svg';

import { Icon } from '@/components/icon';
import { spacing } from '@/theme';

import { useArtPalette, useSvgId } from './art-palette';
import { Beam } from './beam';
import { GlassCard } from './glass-card';
import { GlassNode } from './glass-node';
import { OrbGlyph } from './orb-glyph';
import { useBreath, useCycle } from './use-art-drivers';
import { useArtLoop } from './use-art-loop';

const VB = { w: 300, h: 120 };
const PHONE = { x: 118, y: 6, w: 64, h: 108 };
const NODES = [
  { x: 44, y: 34, icon: 'card' as const, side: -1 },
  { x: 34, y: 88, icon: 'book' as const, side: -1 },
  { x: 256, y: 34, icon: 'globe' as const, side: 1 },
  { x: 266, y: 88, icon: 'wifi' as const, side: 1 },
];

/**
 * Step header · 登录北大账号: the password stays inside the phone (the orb behind a shield);
 * what travels out to each campus service is a session, never the password. Sparks leave the
 * phone on the UI thread for a few rounds, then rest.
 */
export function StepCampusArt() {
  const { width } = useWindowDimensions();
  const w = Math.min(width - spacing.xxl * 2, 340);
  const s = w / VB.w;
  const p = useArtPalette();
  const id = useSvgId('stepcampus');
  const running = useArtLoop(true, 10_000);
  const t = useCycle(running, { duration: 3200, rest: 1 });
  const breath = useBreath(running);
  return (
    <View style={{ width: w, height: VB.h * s }} className="self-center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={VB.h * s} viewBox={`0 0 ${VB.w} ${VB.h}`}>
        {NODES.map((n, i) => (
          <Beam
            key={n.icon}
            a={{ x: n.side < 0 ? PHONE.x - 2 : PHONE.x + PHONE.w + 2, y: n.y < 60 ? 44 : 76 }}
            b={{ x: n.x - n.side * 16, y: n.y }}
            p={t}
            from={0.15 + i * 0.08}
            to={0.55 + i * 0.08}
            pal={p}
          />
        ))}
        <GlassCard id={`${id}ph`} x={PHONE.x} y={PHONE.y} w={PHONE.w} h={PHONE.h} r={16} p={p} />
        <OrbGlyph id={id} cx={150} cy={46} r={17} p={p} pulse={breath} />
      </Svg>
      {NODES.map((n) => (
        <GlassNode key={n.icon} x={n.x} y={n.y} scale={s} size={Math.round(28 * s)} icon={n.icon} p={p} />
      ))}
      <View className="absolute items-center" style={{ left: PHONE.x * s, width: PHONE.w * s, top: 82 * s }}>
        <Icon name="shield" size={18} color={p.accent} />
      </View>
    </View>
  );
}
