import { View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

import { useArtPalette, useSvgId } from './art-palette';
import { Beam } from './beam';
import { GlassCard } from './glass-card';
import { OrbGlyph } from './orb-glyph';
import { useBreath, useEntrance } from './use-art-drivers';
import { useArtLoop } from './use-art-loop';

const VB = { w: 300, h: 120 };

/**
 * Step header · 连接 AI 服务: your key goes in on the left, the agent lights up, and a model
 * answers on the right. One entrance on the UI thread, then the orb breathes briefly.
 */
export function StepAIArt() {
  const t = useT();
  const { width } = useWindowDimensions();
  const w = Math.min(width - spacing.xxl * 2, 340);
  const s = w / VB.w;
  const p = useArtPalette();
  const id = useSvgId('stepai');
  const reduced = useReducedMotion();
  const e = useEntrance(true, reduced, 1600, 150);
  const breath = useBreath(useArtLoop(true, 8_000));
  return (
    <View style={{ width: w, height: VB.h * s }} className="self-center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={VB.h * s} viewBox={`0 0 ${VB.w} ${VB.h}`}>
        <GlassCard id={`${id}a`} x={6} y={40} w={92} h={40} r={14} p={p} />
        <GlassCard id={`${id}b`} x={202} y={40} w={92} h={40} r={14} p={p} />
        <Beam a={{ x: 100, y: 60 }} b={{ x: 120, y: 60 }} p={e} from={0.1} to={0.4} pal={p} />
        <Beam a={{ x: 180, y: 60 }} b={{ x: 200, y: 60 }} p={e} from={0.5} to={0.85} pal={p} />
        <OrbGlyph id={id} cx={150} cy={60} r={24} p={p} pulse={breath} />
      </Svg>
      <View className="absolute flex-row items-center gap-1.5" style={{ left: 18 * s, top: 50 * s }}>
        <Icon name="key" size={14} color={p.accent} />
        <Text variant="caption">{t('welcome.art.apiKey')}</Text>
      </View>
      <View className="absolute flex-row items-center gap-1.5" style={{ left: 216 * s, top: 50 * s }}>
        <Icon name="sparkles" size={14} color={p.accent} />
        <Text variant="caption">{t('welcome.art.model')}</Text>
      </View>
    </View>
  );
}
