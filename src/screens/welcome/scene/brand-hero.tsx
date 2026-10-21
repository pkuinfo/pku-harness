import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ErrorBoundary } from '@/components/error-boundary';
import { useT } from '@/i18n';
import { curves, duration, useThemeName } from '@/theme';
import { haptics } from '@/utils/haptics';

import { OrbArt } from '../intro/illustrations/orb-art';
import { GLView } from './gl';
import type { GLContext, HeroScene, SceneMode } from './hero-scene';
import { useHeroVariant } from './hero-variant';
import { heroVariants } from './variants';

const EASE_OUT = Easing.bezier(...curves.out);
/** No first frame by then (a flaky emulator GPU can hang context creation): show the 2D mark. */
const FIRST_FRAME_TIMEOUT_MS = 2500;

type Status = 'pending' | 'ready' | 'failed';

/**
 * The welcome hero: the agent as a GPU-shaded object (scene/hero-scene.ts, variant from
 * `useHeroVariant`, scene/variants), with every way out covered:
 *
 * - The frame loop runs only while `active`, the screen is focused and the app is in the
 *   foreground; the scene also eases to a stop after a while without touches. Unmounting
 *   disposes it.
 * - Reduced motion renders one still frame (no loop at all).
 * - No ExpoGL module, a shader that fails to compile, a context that fails to draw, or no first
 *   frame in time: the 2D orb (SVG) takes over (static under reduced motion).
 * - Theme changes repaint it with the other palette (light page: tinted coverage; dark: light).
 *
 * Drag tilts it (springs back with the finger's velocity); a tap flashes it and sends the
 * services round once more.
 */
export function BrandHero({ size, active, mode = 'intro', forceFallback = false }: { size: number; active: boolean; mode?: SceneMode; forceFallback?: boolean }) {
  const t = useT();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const theme = useThemeName();
  const variant = useHeroVariant();
  // The theme at context creation (later changes go through setTheme).
  const themeRef = useRef(theme);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [status, setStatus] = useState<Status>(GLView && !forceFallback ? 'pending' : 'failed');
  const scene = useRef<HeroScene | null>(null);
  const live = active && focused && appActive;
  // Read by onContextCreate, which can fire long after the render that set it up.
  const liveRef = useRef(live);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const fail = useCallback((why: unknown) => {
    if (__DEV__) console.warn('[welcome] 3D hero unavailable, using 2D:', why instanceof Error ? why.message : why);
    scene.current?.dispose();
    scene.current = null;
    setStatus('failed');
  }, []);

  useEffect(() => {
    if (status !== 'pending') return;
    const t = setTimeout(() => fail('no first frame'), FIRST_FRAME_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status, fail]);

  useEffect(() => {
    themeRef.current = theme;
    scene.current?.setTheme(theme === 'light');
  }, [theme, status]);

  useEffect(() => {
    liveRef.current = live;
    scene.current?.setActive(live);
  }, [live, status]);

  useEffect(
    () => () => {
      scene.current?.dispose();
      scene.current = null;
    },
    [],
  );

  // Called again with a new context when Android recreates the surface (e.g. after background).
  const onContextCreate = useCallback(
    (gl: GLContext) => {
      scene.current?.dispose();
      scene.current = null;
      try {
        // Required lazily: the shader code only loads where GL actually works.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { HeroScene: Scene } = require('./hero-scene') as typeof import('./hero-scene');
        const pixelRatio = gl.drawingBufferWidth / Math.max(1, size);
        const s = new Scene(gl, { spec: heroVariants[variant], mode, still: reduced, light: themeRef.current === 'light', pixelRatio, onError: fail });
        s.start();
        s.setActive(liveRef.current);
        scene.current = s;
        setStatus('ready');
      } catch (e) {
        fail(e);
      }
    },
    [mode, reduced, fail, variant, size],
  );

  // Fade the GL layer in on its first frame, so a slow context never pops.
  const shown = useSharedValue(0);
  useEffect(() => {
    if (status === 'ready') shown.set(withTiming(1, { duration: duration.slow, easing: EASE_OUT }));
  }, [status, shown]);
  const glStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));

  // JS-thread callbacks: they only poke the scene (no React state), and the scene runs on JS.
  // Vertical drags tilt it; horizontal ones fail fast so the pager keeps its swipe.
  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetY: [-10, 10],
    failOffsetX: [-14, 14],
    onUpdate: (e) => scene.current?.drag(e.translationX, e.translationY),
    onDeactivate: (e) => scene.current?.release(e.velocityX, e.velocityY),
    onFinalize: () => scene.current?.release(0, 0),
  });
  const tap = useTapGesture({
    runOnJS: true,
    onActivate: () => {
      if (!scene.current) return;
      haptics.tap();
      scene.current.boostOnce();
    },
  });
  const gesture = useExclusiveGestures(pan, tap);

  const Native = GLView;
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={t('welcome.heroA11y')}>
      {status === 'failed' ? (
        <View className="flex-1 items-center justify-center">
          <OrbArt size={size} live={live} intro={mode === 'intro'} />
        </View>
      ) : Native ? (
        <ErrorBoundary fallback={(e) => <Failed error={e} onFail={fail} />}>
          <GestureDetector gesture={gesture}>
            <Animated.View className="flex-1" style={glStyle}>
              {/* Keyed: a new variant gets a fresh context (and a fresh intro). */}
              <Native key={variant} style={{ flex: 1 }} onContextCreate={onContextCreate} />
            </Animated.View>
          </GestureDetector>
        </ErrorBoundary>
      ) : null}
    </View>
  );
}

/** Render error inside the GL subtree: report it once, the parent switches to 2D. */
function Failed({ error, onFail }: { error: Error; onFail: (e: unknown) => void }) {
  useEffect(() => onFail(error), [error, onFail]);
  return null;
}
