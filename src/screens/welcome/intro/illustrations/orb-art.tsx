import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { useArtPalette, useSvgId } from './art-palette';
import { OrbGlyph } from './orb-glyph';
import { OrbitHalf, type Orbit } from './orbit-beads';
import { useArtLoop } from './use-art-loop';
import { useBreath, useEntrance, useOrbitAngle } from './use-art-drivers';

// viewBox 0 0 200 200, laid out like the 3D orb (scene/variants/orb.ts).
const C = 100;
const ORBITS: Orbit[] = [
  { rx: 74, ry: 22, deg: 16, beads: 4, phase: 0.4, speed: 1, size: 3 },
  { rx: 88, ry: 15, deg: -22, beads: 3, phase: 1.9, speed: -0.7, size: 2.4 },
];

/**
 * The agent orb with its orbit of services, in SVG: the 3D hero's 2D stand-in (no GL, a shader
 * that won't compile, `?gl=0`) and the anchor of the welcome illustrations. Beads lap and the
 * inner light breathes on the UI thread while `live`, within a budget; static under reduced
 * motion.
 */
export function OrbArt({ size, live, intro = false }: { size: number; live: boolean; intro?: boolean }) {
  const p = useArtPalette();
  const id = useSvgId('orb');
  const reduced = useReducedMotion();
  const running = useArtLoop(live, 16_000);
  const breath = useBreath(running);
  const enter = useEntrance(true, reduced || !intro, 1100);
  const angle = useOrbitAngle(running, 14_000);

  const style = useAnimatedStyle(() => ({ opacity: enter.get(), transform: [{ scale: 0.86 + 0.14 * enter.get() }] }));

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ flex: 1 }, style]}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          {ORBITS.map((o, i) => (
            <OrbitHalf key={`f${i}`} id={`${id}f${i}`} cx={C} cy={C} o={o} near={false} angle={angle} p={p} reveal={enter} />
          ))}
          <OrbGlyph id={id} cx={C} cy={C} r={46} p={p} pulse={breath} />
          {ORBITS.map((o, i) => (
            <OrbitHalf key={`n${i}`} id={`${id}n${i}`} cx={C} cy={C} o={o} near angle={angle} p={p} reveal={enter} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
