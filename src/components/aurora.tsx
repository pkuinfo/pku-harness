import { Canvas, Circle, Fill, RadialGradient, vec } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Easing, useDerivedValue, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { auroraPalettes, useThemeName } from '@/theme';

/** One full cycle of the drift; long enough that motion reads as light, not animation. */
const CYCLE_MS = 36_000;

type Blob = { x: number; y: number; r: number; color: string };

function Light({ blob, i, t, w, h }: { blob: Blob; i: number; t: SharedValue<number>; w: number; h: number }) {
  const r = blob.r * w;
  // Each blob orbits its anchor on its own ellipse and phase (Lissajous), on the UI thread.
  const c = useDerivedValue(() => {
    const a = t.get() * Math.PI * 2;
    const k = i + 1;
    return vec(blob.x * w + Math.sin(a * (k % 2 ? 1 : -1) + i * 1.7) * w * 0.12, blob.y * h + Math.cos(a * (k % 3 ? 1 : 2) + i) * h * 0.06);
  });
  return (
    <Circle c={c} r={r}>
      <RadialGradient c={c} r={r} colors={[blob.color, 'transparent']} />
    </Circle>
  );
}

/**
 * Soft drifting light in PKU colours behind glass panels (docs/DESIGN.md §1). Skia draws a few
 * radial gradients; their positions are derived on the UI thread from one looping clock, so the
 * JS thread does nothing. Reduced motion holds still.
 */
export function Aurora() {
  const name = useThemeName();
  const palette = auroraPalettes[name];
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    t.set(withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }), -1, false));
  }, [reduced, t]);

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill color={palette.base} />
          {palette.blobs.map((b, i) => (
            <Light key={i} blob={b} i={i} t={t} w={size.w} h={size.h} />
          ))}
        </Canvas>
      ) : null}
    </View>
  );
}
