import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';

import type { ArtPalette } from './art-palette';

/**
 * A campus service in the illustrations: a small glass disc with its icon (real app icons, so
 * they stay crisp), placed in the art's viewBox coordinates (`x`, `y` × `scale`). `lit` (0..1,
 * UI thread) rings it in brand red and pops it, when the agent reaches it.
 */
export function GlassNode({ x, y, scale, size, icon, p, lit, shape = 'circle' }: { x: number; y: number; scale: number; size: number; icon: IconName; p: ArtPalette; lit?: SharedValue<number>; shape?: 'circle' | 'square' }) {
  const pop = useAnimatedStyle(() => {
    const v = lit ? lit.get() : 0;
    return { transform: [{ scale: 1 + 0.08 * Math.sin(Math.min(1, v) * Math.PI) }] };
  });
  const ring = useAnimatedStyle(() => ({ opacity: lit ? lit.get() : 0 }));
  const radius = shape === 'circle' ? size / 2 : size * 0.3;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: x * scale - size / 2, top: y * scale - size / 2, width: size, height: size }, pop]}>
      <View
        className="flex-1 items-center justify-center border-[0.5px]"
        style={{ borderRadius: radius, borderCurve: 'continuous', backgroundColor: p.cardFill, borderColor: p.cardEdge }}>
        <Icon name={icon} size={Math.round(size * 0.46)} color={p.dark ? p.text : p.muted} />
      </View>
      <Animated.View
        className="absolute inset-0 items-center justify-center"
        style={[{ borderRadius: radius, borderCurve: 'continuous', borderWidth: 1, borderColor: p.accent, backgroundColor: p.dark ? p.night : p.elevated }, ring]}>
        <Icon name={icon} size={Math.round(size * 0.46)} color={p.accent} />
      </Animated.View>
    </Animated.View>
  );
}
