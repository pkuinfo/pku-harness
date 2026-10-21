import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';

import type { ArtPalette } from './art-palette';
import { orbitXY } from './orbit-path';

/**
 * A service riding an orbit (viewBox coords × `scale`): a glass tile with its icon, smaller and
 * dimmer on the far half. `dock` (0..1) flies it in from `from` to its slot, for a plugin being
 * installed. Position comes from `angle` in a worklet (UI thread).
 */
export function OrbitNode({ cx, cy, rx, ry, deg, phase, angle, speed, scale, size, icon, p, dock, from, accent = false }: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  deg: number;
  phase: number;
  angle: SharedValue<number>;
  speed: number;
  scale: number;
  size: number;
  icon: IconName;
  p: ArtPalette;
  dock?: SharedValue<number>;
  from?: { x: number; y: number };
  accent?: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const q = orbitXY(cx, cy, rx, ry, deg, phase + angle.get() * speed);
    const k = dock ? dock.get() : 1;
    const x = from ? from.x + (q.x - from.x) * k : q.x;
    const y = from ? from.y + (q.y - from.y) * k : q.y;
    const near = (q.depth + 1) / 2;
    const depthScale = 0.82 + 0.22 * near;
    return {
      opacity: (0.55 + 0.45 * near) * (dock ? Math.min(1, k * 3) : 1),
      transform: [{ translateX: x * scale - size / 2 }, { translateY: y * scale - size / 2 }, { scale: depthScale * (dock ? 0.7 + 0.3 * k : 1) }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
      <View
        className="flex-1 items-center justify-center border-[0.5px]"
        style={{ borderRadius: size * 0.32, borderCurve: 'continuous', backgroundColor: accent ? p.accent : p.cardFill, borderColor: accent ? p.accent : p.cardEdge }}>
        <Icon name={icon} size={Math.round(size * 0.48)} color={accent ? p.white : p.dark ? p.text : p.muted} />
      </View>
    </Animated.View>
  );
}
