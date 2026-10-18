import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  RoundedRect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { brand, orbitPath } from '@/theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * The brand mark, drawn with Skia so it can perform: with `intro` the stem and orbit draw on and
 * the agent dot arrives and keeps orbiting; `tile={false}` draws the mark alone (on hero
 * backgrounds). Geometry is shared with the app icon (src/theme/brand.ts).
 */
export function Logo({ size = 64, tile = true, intro = false, orbiting = false }: { size?: number; tile?: boolean; intro?: boolean; orbiting?: boolean }) {
  const reduced = useReducedMotion();
  const draw = useSharedValue(intro && !reduced ? 0 : 1);
  const angle = useSharedValue(brand.agent.deg);
  const dotIn = useSharedValue(intro && !reduced ? 0 : 1);

  useEffect(() => {
    if (intro && !reduced) {
      draw.set(withTiming(1, { duration: 1100, easing: EASE_OUT }));
      dotIn.set(withDelay(700, withTiming(1, { duration: 600, easing: EASE_OUT })));
    }
    if (orbiting && !reduced) {
      angle.set(withDelay(intro ? 1200 : 0, withRepeat(withTiming(brand.agent.deg + 360, { duration: 9000, easing: Easing.linear }), -1, false)));
    }
  }, [intro, orbiting, reduced, draw, angle, dotIn]);

  const orbit = useMemo(() => Skia.Path.MakeFromSVGString(orbitPath())!, []);
  const scale = size / 120;
  const s = brand.stem;
  const o = brand.orbit;

  const stemH = useDerivedValue(() => s.height * Math.min(1, draw.get() * 1.6));
  const orbitEnd = useDerivedValue(() => Math.max(0, Math.min(1, draw.get() * 1.4 - 0.3)));
  const dotX = useDerivedValue(() => o.cx + o.r * Math.cos((angle.get() * Math.PI) / 180));
  const dotY = useDerivedValue(() => o.cy + o.r * Math.sin((angle.get() * Math.PI) / 180));
  const dotR = useDerivedValue(() => brand.agent.r * dotIn.get());
  const gapR = useDerivedValue(() => (brand.agent.r + 2.2) * dotIn.get());
  const glowR = useDerivedValue(() => brand.agent.r * 2.4 * dotIn.get());

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale }]}>
        {tile ? (
          <>
            <RoundedRect x={0} y={0} width={120} height={120} r={brand.tile.radius}>
              <LinearGradient start={vec(0, 0)} end={vec(120, 120)} colors={[...brand.tile.stops]} positions={[0, 0.5, 1]} />
            </RoundedRect>
            <RoundedRect x={0} y={0} width={120} height={120} r={brand.tile.radius}>
              <RadialGradient c={vec(brand.highlight.cx, brand.highlight.cy)} r={brand.highlight.r} colors={[`rgba(255,255,255,${brand.highlight.opacity})`, 'rgba(255,255,255,0)']} />
            </RoundedRect>
          </>
        ) : null}
        {/* The agent's gap is cut out of the mark with a clear blend. */}
        <Group layer>
          <RoundedRect x={s.x} y={s.y} width={s.width} height={stemH} r={s.rx}>
            <LinearGradient start={vec(0, 20)} end={vec(0, 100)} colors={[...brand.ink]} />
          </RoundedRect>
          <Path path={orbit} style="stroke" strokeWidth={o.stroke} strokeCap="butt" start={0} end={orbitEnd}>
            <LinearGradient start={vec(0, 20)} end={vec(0, 100)} colors={[...brand.ink]} />
          </Path>
          <Circle cx={dotX} cy={dotY} r={gapR} color="black" blendMode="clear" />
        </Group>
        <Circle cx={dotX} cy={dotY} r={glowR} color={brand.glow} opacity={0.55}>
          <BlurMask blur={6} style="normal" />
        </Circle>
        <Circle cx={dotX} cy={dotY} r={dotR} color="#FFFFFF" />
      </Group>
    </Canvas>
  );
}
