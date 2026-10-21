import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Aurora } from '@/components/aurora';
import { completeOnboarding, onboardingProgress } from '@/core/boot';
import { curves, duration } from '@/theme';
import { haptics } from '@/utils/haptics';

import { advance, parseProgress, prevStep, retreat, startSetup, type OnboardingProgress, type Phase, type SetupStep, type StepOutcome } from './flow';
import { Intro } from './intro/intro';
import { prefillChat } from './prefill';
import { HeroVariantProvider } from './scene/hero-variant';
import { parseHeroVariant } from './scene/variants';
import { AIStep } from './steps/ai-step';
import { CampusStep } from './steps/campus-step';
import { DoneStep } from './steps/done-step';
import { PermissionsStep } from './steps/permissions-step';
import { PluginsStep } from './steps/plugins-step';

const EASE_OUT = Easing.bezier(...curves.out);
const ENTER_MS = duration.slow;
const EXIT_MS = duration.base;

const keyOf = (p: Phase) => (p.kind === 'intro' ? 'intro' : p.step);

/**
 * One layer of the phase transition. The same element stays mounted (same key) while it leaves,
 * so its state survives the exit; forwards slides in from the right, back from the left.
 */
function Layer({ leaving, dir, children }: { leaving: boolean; dir: 1 | -1; children: ReactNode }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(leaving ? -1 : 1, { duration: leaving ? EXIT_MS : ENTER_MS, easing: EASE_OUT }));
  }, [leaving, p]);
  const style = useAnimatedStyle(() => {
    const v = p.get();
    const opacity = v >= 0 ? v : 1 + v;
    if (reduced) return { opacity };
    // Entering: from 40 px on the incoming side. Leaving: drift 24 px the other way and recede.
    const x = v >= 0 ? (1 - v) * 40 * dir : v * 24 * dir;
    const scale = v >= 0 ? 1 : 1 + v * 0.02;
    return { opacity, transform: [{ translateX: x }, { scale }] };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents={leaving ? 'none' : 'auto'}>
      {children}
    </Animated.View>
  );
}

/**
 * First run (src/app/welcome.tsx): the intro and terms, then setup (AI service → campus account
 * → plugins → reminder permissions → done). Progress is saved after every step, so a kill mid-setup resumes on the same
 * step; onboarding completes only on the finish screen.
 *
 * Dev only: `pkuharness://welcome?reset=1` replays it from the start without touching any data
 * (an onboarded device stays onboarded); add `&hero=orb|eclipse|silk` to pick the hero variant
 * (scene/variants, default orb) and `&gl=0` to see its 2D fallback.
 */
export function Welcome() {
  const params = useLocalSearchParams<{ reset?: string; gl?: string; hero?: string }>();
  const devReset = __DEV__ && params.reset === '1';
  const forceFallback = __DEV__ && params.gl === '0';
  const hero = parseHeroVariant(__DEV__ ? params.hero : undefined);

  const [progress, setProgress] = useState<OnboardingProgress | null>(() => (devReset ? null : parseProgress(onboardingProgress.get())));
  const [phase, setPhase] = useState<Phase>(() => (progress ? { kind: 'setup', step: progress.step } : { kind: 'intro' }));
  const [leaving, setLeaving] = useState<Phase | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [introAtEnd, setIntroAtEnd] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (devReset) void onboardingProgress.clear();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback(
    (next: Phase, d: 1 | -1) => {
      setDir(d);
      setLeaving(phase);
      setPhase(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setLeaving(null), EXIT_MS + 40);
    },
    [phase],
  );

  const save = (p: OnboardingProgress) => {
    setProgress(p);
    void onboardingProgress.set(p);
  };

  const accept = () => {
    haptics.success();
    const p = progress ?? startSetup(Date.now());
    save({ ...p, step: 'ai' });
    go({ kind: 'setup', step: 'ai' }, 1);
  };

  const finishStep = (step: SetupStep, outcome: StepOutcome) => {
    if (!progress) return;
    const p = advance(progress, step, outcome);
    save(p);
    go({ kind: 'setup', step: p.step }, 1);
  };

  const back = useCallback(
    (step: SetupStep) => {
      haptics.tap();
      const prev = prevStep(step);
      if (!prev) {
        setIntroAtEnd(true);
        go({ kind: 'intro' }, -1);
        return;
      }
      if (progress) save(retreat(progress, step));
      go({ kind: 'setup', step: prev }, -1);
    },
    [progress, go],
  );

  // Android back walks back through the steps (the intro keeps the system behaviour).
  useEffect(() => {
    if (phase.kind !== 'setup' || finishing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back(phase.step);
      return true;
    });
    return () => sub.remove();
  }, [phase, finishing, back]);

  // The finish: the screen recedes and the chat tab fades in under it.
  const out = useSharedValue(1);
  const outStyle = useAnimatedStyle(() => ({ opacity: out.get(), transform: [{ scale: 1 + (1 - out.get()) * 0.04 }] }));
  const finish = (question?: string) => {
    if (finishing) return;
    setFinishing(true);
    haptics.success();
    out.set(withTiming(0, { duration: duration.base + 60, easing: EASE_OUT }));
    setTimeout(async () => {
      await completeOnboarding();
      router.replace('/');
      if (question) prefillChat(question);
    }, duration.base + 60);
  };

  const render = (p: Phase, isLeaving: boolean) => {
    if (p.kind === 'intro') return <Intro onAccept={accept} startAtEnd={introAtEnd} live={!isLeaving} forceFallback={forceFallback} />;
    const skip = () => finishStep(p.step, 'skipped');
    const done = () => finishStep(p.step, 'done');
    const onBack = () => back(p.step);
    switch (p.step) {
      case 'ai':
        return <AIStep onDone={done} onSkip={skip} onBack={onBack} />;
      case 'campus':
        return <CampusStep onDone={done} onSkip={skip} onBack={onBack} />;
      case 'plugins':
        return <PluginsStep onDone={done} onSkip={skip} onBack={onBack} />;
      case 'permissions':
        return <PermissionsStep onDone={done} onSkip={skip} onBack={onBack} />;
      case 'done':
        return <DoneStep onFinish={finish} onBack={onBack} live={!isLeaving && !finishing} forceFallback={forceFallback} />;
    }
  };

  const layers: { phase: Phase; leaving: boolean }[] = leaving && keyOf(leaving) !== keyOf(phase) ? [{ phase: leaving, leaving: true }, { phase, leaving: false }] : [{ phase, leaving: false }];

  return (
    <HeroVariantProvider value={hero}>
      <View className="flex-1 bg-bg">
        {/* The intro paints its own aurora (it drifts with the pages); setup shares this one. */}
        {phase.kind === 'setup' ? <Aurora /> : null}
        <Animated.View className="flex-1" style={outStyle}>
          {layers.map((l) => (
            <Layer key={keyOf(l.phase)} leaving={l.leaving} dir={dir}>
              {render(l.phase, l.leaving)}
            </Layer>
          ))}
        </Animated.View>
      </View>
    </HeroVariantProvider>
  );
}
