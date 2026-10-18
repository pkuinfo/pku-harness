import { BlurMask, Canvas, Circle, RadialGradient, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { palette, useTheme } from '@/theme';

export type OrbState = 'idle' | 'thinking';

/**
 * The agent's presence: a softly breathing PKU-red orb with an orbiting highlight.
 * Breathes slowly when idle, pulses and spins faster while thinking. Hero effect #1.
 */
export function AgentOrb({ size = 120, state = 'idle' }: { size?: number; state?: OrbState }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    const fast = state === 'thinking';
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration: fast ? 900 : 3200, easing: Easing.inOut(Easing.sin) }), -1, true));
    spin.set(0);
    spin.set(withRepeat(withTiming(Math.PI * 2, { duration: fast ? 1400 : 6000, easing: Easing.linear }), -1, false));
  }, [state, reduced, t, spin]);

  const center = size / 2;
  const base = size * 0.24;
  const radius = useDerivedValue(() => base * (1 + 0.08 * t.value));
  const glowR = useDerivedValue(() => base * (1.15 + 0.2 * t.value));
  const hx = useDerivedValue(() => center + Math.cos(spin.value) * base * 0.45);
  const hy = useDerivedValue(() => center + Math.sin(spin.value) * base * 0.45);
  const highlight = useDerivedValue(() => vec(hx.value, hy.value));

  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={center} cy={center} r={glowR} color={c.glow} opacity={0.5}>
        <BlurMask blur={size * 0.08} style="normal" />
      </Circle>
      <Circle cx={center} cy={center} r={radius}>
        <RadialGradient c={highlight} r={base * 1.4} colors={['#FFD2D6', palette.pkuRedBright, palette.pkuRedDeep]} />
      </Circle>
    </Canvas>
  );
}
