import {
  BackdropBlur,
  Canvas,
  Fill,
  Group,
  LinearGradient,
  rrect,
  RoundedRect,
  Shader,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { backdropPalettes, glassTokens, useThemeName } from '@/theme';

/**
 * GPU backdrop: domain-warped colour fields in SkSL, animated on the UI thread (Skia clock).
 * Hero moments only (welcome, chat empty state); content sits on top as normal RN views.
 */
const source = Skia.RuntimeEffect.Make(`
uniform float2 size;
uniform float time;
uniform float energy;
uniform half3 bg;
uniform half3 c1;
uniform half3 c2;
uniform half3 c3;
uniform half3 c4;

float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), u.x), mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

half4 main(float2 xy) {
  float2 uv = xy / size;
  float2 p = float2(uv.x * size.x / size.y, uv.y);
  float t = time * 0.00006 * energy;
  // Two rounds of domain warping give the liquid, slowly folding look.
  float2 q = float2(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 4.7));
  float2 r = float2(noise(p * 2.1 + q * 1.8 + t * 1.3 + 1.7), noise(p * 2.1 + q * 1.8 - t * 0.9 + 9.2));
  float f = fbm(p * 1.2 + r * 2.2);

  half3 col = bg;
  col = mix(col, c1, smoothstep(0.35, 0.85, f) * 0.95);
  col = mix(col, c2, smoothstep(0.45, 0.95, r.x) * 0.75);
  col = mix(col, c3, smoothstep(0.55, 1.0, q.y) * 0.55);
  col = mix(col, c4, smoothstep(0.7, 1.0, f * r.y) * 0.6);
  // Vignette keeps text areas calm; grain kills banding on 8-bit screens.
  float v = smoothstep(1.25, 0.25, length(uv - float2(0.5, 0.42)));
  col = mix(bg, col, 0.35 + 0.65 * v);
  col += (hash(xy + time) - 0.5) * 0.025;
  return half4(col, 1.0);
}
`)!;

const SCALE = 4;
/** The flow is slow; ~24 fps is indistinguishable from 60/120 and costs a fraction. */
const FRAME_MS = 42;

export type GlassRect = { x: number; y: number; width: number; height: number; r?: number };

const hex3 = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function GlassPanel({ rect, dark }: { rect: GlassRect; dark: boolean }) {
  const r = rect.r ?? 24;
  const g = glassTokens[dark ? 'dark' : 'light'];
  const clip = rrect(Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height), r, r);
  return (
    <Group>
      <BackdropBlur blur={22} clip={clip}>
        <Fill color={g.fill} />
      </BackdropBlur>
      {/* Sheen: light catches the top edge of the glass. */}
      <RoundedRect x={rect.x} y={rect.y} width={rect.width} height={rect.height} r={r}>
        <LinearGradient
          start={vec(rect.x, rect.y)}
          end={vec(rect.x, rect.y + rect.height)}
          colors={[...g.sheen]}
          positions={[0, 0.45, 1]}
        />
      </RoundedRect>
      {/* Specular rim. */}
      <RoundedRect x={rect.x + 0.5} y={rect.y + 0.5} width={rect.width - 1} height={rect.height - 1} r={r} style="stroke" strokeWidth={1}>
        <LinearGradient
          start={vec(rect.x, rect.y)}
          end={vec(rect.x + rect.width, rect.y + rect.height)}
          colors={[...g.rim]}
        />
      </RoundedRect>
    </Group>
  );
}

export function ShaderBackdrop({
  style,
  energy = 1,
  glass = [],
  progress,
}: {
  style?: StyleProp<ViewStyle>;
  /** Speed multiplier of the flow. */
  energy?: number;
  /** Liquid-glass panels drawn over the backdrop (canvas coordinates). */
  glass?: GlassRect[];
  /** Optional shared value (e.g. pager position) that shifts the flow. */
  progress?: SharedValue<number>;
}) {
  const name = useThemeName();
  const reduced = useReducedMotion();
  const time = useSharedValue(20000);
  const last = useSharedValue(0);
  useFrameCallback((f) => {
    if (reduced || f.timeSinceFirstFrame - last.get() < FRAME_MS) return;
    last.set(f.timeSinceFirstFrame);
    time.set(20000 + f.timeSinceFirstFrame);
  });
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Colours are converted once on the JS side; the worklet only reads plain arrays.
  const colors = useMemo(() => {
    const pal = backdropPalettes[name];
    return { bg: hex3(pal.bg), c1: hex3(pal.c1), c2: hex3(pal.c2), c3: hex3(pal.c3), c4: hex3(pal.c4) };
  }, [name]);
  // The field is soft, so it renders at 1/SCALE resolution and the compositor upscales it:
  // ~9x less fragment work, which keeps the UI thread free for touches and saves battery.
  const lw = Math.ceil(size.width / SCALE);
  const lh = Math.ceil(size.height / SCALE);
  const uniforms = useDerivedValue(() => ({
    size: [lw || 1, lh || 1],
    time: time.get() + (progress ? progress.get() * 9000 : 0),
    energy,
    ...colors,
  }));
  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <View style={[StyleSheet.absoluteFill, style]} onLayout={onLayout} pointerEvents="none">
      {size.width > 0 ? (
        <>
          <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: lw, height: lh, transformOrigin: 'top left', transform: [{ scale: SCALE }] }}>
            <Fill>
              <Shader source={source} uniforms={uniforms} />
            </Fill>
          </Canvas>
          {glass.length ? (
            <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
              {glass.map((g, i) => (
                <GlassPanel key={i} rect={g} dark={name === 'dark'} />
              ))}
            </Canvas>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
