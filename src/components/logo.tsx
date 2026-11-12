import { Canvas, Group, Path, RoundedRect, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import {
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { brand } from '@/theme';

/** Canonical swallow. `orbiting` retains call-site compatibility and gently pulses while busy. */
export function Logo({ size = 64, tile = true, intro = false, orbiting = false }: { size?: number; tile?: boolean; intro?: boolean; orbiting?: boolean }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(intro && !reduced ? 0 : 1);
  const mark = useMemo(() => Skia.Path.MakeFromSVGString(brand.path)!, []);

  useEffect(() => {
    cancelAnimation(opacity);
    if (reduced) {
      opacity.set(1);
    } else if (orbiting) {
      opacity.set(withRepeat(withSequence(
        withTiming(brand.motion.activeOpacity, { duration: brand.motion.pulseMs }),
        withTiming(1, { duration: brand.motion.pulseMs }),
      ), -1, false));
    } else {
      opacity.set(withTiming(1, { duration: intro ? brand.motion.introMs : 0 }));
    }
    return () => cancelAnimation(opacity);
  }, [intro, orbiting, reduced, opacity]);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale: size / 120 }]}>
        {tile ? <RoundedRect x={0} y={0} width={120} height={120} r={brand.tile.radius} color={brand.primary} /> : null}
        <Group opacity={opacity}>
          <Path path={mark} color={brand.white} fillType="evenOdd" />
        </Group>
      </Group>
    </Canvas>
  );
}
