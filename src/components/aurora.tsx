import { useIsFocused } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { auroraPalettes, useThemeName } from '@/theme';

/** One full cycle of the drift; long enough that motion reads as light, not animation. */
const CYCLE_MS = 36_000;
/**
 * The lights move a few px a second, so ~15 steps a second look the same as 60 and let the frame
 * (and the tab bar's blur of it) rest in between.
 */
const STEP_MS = 66;

/**
 * With no touch and nothing held awake for this long, the lights rest: the drift is a few px a
 * second, so stopping is invisible, but every step repaints the backdrop (and the tab bar's blur
 * of it). Any touch wakes them, continuing from where they stopped.
 */
const IDLE_MS = 10_000;

let awake = true;
let holds = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function setAwake(next: boolean) {
  if (next === awake) return;
  awake = next;
  listeners.forEach((l) => l());
}

function scheduleRest() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => setAwake(holds > 0), IDLE_MS);
}

/** Something happened on screen (the root layout calls this on every touch). */
export function wakeAurora() {
  setAwake(true);
  scheduleRest();
}

/** Keep the lights moving while `active` (e.g. a reply streaming in), then let them rest. */
export function useAuroraAwake(active: boolean) {
  useEffect(() => {
    if (!active) return;
    holds++;
    setAwake(true);
    return () => {
      holds--;
      scheduleRest();
    };
  }, [active]);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const useAwake = () => useSyncExternalStore(subscribe, () => awake);

scheduleRest();

type Blob = { x: number; y: number; r: number; color: string };

/** `rgba(r, g, b, a)` → the same colour fully clear, so the falloff never greys towards black. */
const clear = (color: string) => color.replace(/,\s*[\d.]+\)$/, ', 0)');

function Light({ blob, i, drift, w, h, shift }: { blob: Blob; i: number; drift: SharedValue<number>; w: number; h: number; shift?: SharedValue<number> }) {
  const r = blob.r * w;
  // Each blob orbits its anchor on its own ellipse and phase (Lissajous), on the UI thread.
  const move = useAnimatedStyle(() => {
    const a = (drift.get() / CYCLE_MS) * Math.PI * 2;
    const k = i + 1;
    // Parallax: nearer lights (lower index) travel further as pages swipe.
    const px = shift ? -shift.get() * w * (0.18 - i * 0.04) : 0;
    return {
      transform: [
        { translateX: px + Math.sin(a * (k % 2 ? 1 : -1) + i * 1.7) * w * 0.12 },
        { translateY: Math.cos(a * (k % 3 ? 1 : 2) + i) * h * 0.06 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: blob.x * w - r, top: blob.y * h - r, width: r * 2, height: r * 2, backgroundImage: `radial-gradient(circle closest-side, ${blob.color}, ${clear(blob.color)})` },
        move,
      ]}
    />
  );
}

/**
 * Soft drifting light in PKU colours behind glass panels (docs/DESIGN.md §1): a few radial
 * gradients on plain views, moved by transforms from a UI-thread clock, so the JS thread does
 * nothing. Plain views (not a Skia canvas, whose Android TextureView the tab bar's blur cannot
 * capture and which redrew every frame) keep the backdrop cheap. Reduced motion holds still; an
 * unfocused screen's aurora pauses, and all of them rest when the app is idle (`wakeAurora`).
 */
export function Aurora({ shift }: { shift?: SharedValue<number> } = {}) {
  const name = useThemeName();
  const palette = auroraPalettes[name];
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  // `clock` runs every frame; `drift` (what the lights read) only advances in STEP_MS steps.
  const clock = useSharedValue(0);
  const drift = useSharedValue(0);
  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    // Cap the step so a stalled frame never makes the lights jump.
    const now = clock.get() + Math.min(timeSincePreviousFrame ?? 0, 100);
    clock.set(now);
    if (now - drift.get() >= STEP_MS) drift.set(now);
  }, false);

  // Drift only while this screen is on top and the app is in use: covered screens and idle
  // moments keep their aurora but stop the clock.
  const focused = useIsFocused();
  const live = useAwake();
  useEffect(() => {
    frame.setActive(focused && live && !reduced);
  }, [focused, live, reduced, frame]);

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.base, overflow: 'hidden' }]} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0 ? palette.blobs.map((b, i) => <Light key={i} blob={b} i={i} drift={drift} w={size.w} h={size.h} shift={shift} />) : null}
    </View>
  );
}
