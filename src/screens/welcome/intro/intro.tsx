import { useEffect, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { Aurora } from '@/components/aurora';
import { Button } from '@/components/button';
import { NativeCheckbox } from '@/components/native-checkbox';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { curves, duration, spacing } from '@/theme';
import { haptics } from '@/utils/haptics';

import { BrandHero } from '../scene/brand-hero';
import { PAGES, type IntroPage } from './copy';
import { AgentArt } from './illustrations/agent-art';
import { DashboardArt } from './illustrations/dashboard-art';
import { PluginArt } from './illustrations/plugin-art';
import { ReminderArt } from './illustrations/reminder-art';

const EASE_OUT = Easing.bezier(...curves.out);
/** The copy and footer wait for the hero to light up (scene INTRO timeline ≈ 1.4 s). */
const COPY_DELAY_MS = 700;
const FOOTER_DELAY_MS = 1000;

/**
 * Layered parallax: as the pager moves, each layer travels at its own depth and fades, so the
 * art, kicker, title and body separate in space instead of sliding as one card.
 */
function useLayer(scroll: SharedValue<number>, index: number, width: number, depth: number, reduced: boolean) {
  return useAnimatedStyle(() => {
    const d = scroll.get() / width - index;
    const fade = interpolate(Math.abs(d), [0, 0.6], [1, 0], 'clamp');
    if (reduced) return { opacity: fade };
    return {
      opacity: fade,
      transform: [{ translateX: -d * width * 0.32 * depth }, { scale: interpolate(Math.abs(d), [0, 1], [1, 0.94], 'clamp') }],
    };
  });
}

function Dot({ scroll, index, width }: { scroll: SharedValue<number>; index: number; width: number }) {
  // A childless, absolutely sized pill: animating its width re-lays out nothing else.
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scroll.get() / width - index);
    return { width: interpolate(d, [0, 1], [22, 6], 'clamp'), opacity: interpolate(d, [0, 1], [1, 0.3], 'clamp') };
  });
  return <Animated.View className="h-1.5 rounded-full bg-fg" style={style} />;
}

function PageView({ page, index, scroll, width, current, intro, heroSize, forceFallback, live }: { page: IntroPage; index: number; scroll: SharedValue<number>; width: number; current: number; intro: SharedValue<number>; heroSize: number; forceFallback: boolean; live: boolean }) {
  const t = useT();
  const reduced = useReducedMotion();
  const art = useLayer(scroll, index, width, 1.5, reduced);
  const kicker = useLayer(scroll, index, width, 0.45, reduced);
  const title = useLayer(scroll, index, width, 0.7, reduced);
  const body = useLayer(scroll, index, width, 1, reduced);
  // First page only: the copy rises in once the hero has lit up.
  const enter = useAnimatedStyle(() => (index === 0 ? { opacity: intro.get(), transform: [{ translateY: (1 - intro.get()) * 14 }] } : {}));
  const active = current === index;
  const near = Math.abs(current - index) <= 1;
  return (
    <View className="flex-1 gap-6 px-6" style={{ width }}>
      <Animated.View className="items-center justify-center" style={[{ minHeight: heroSize }, art]}>
        {/* Only the current page and its neighbours mount their (animated) art. */}
        {!near ? null : index === 0 ? (
          <BrandHero size={heroSize} active={active && live} forceFallback={forceFallback} />
        ) : index === 1 ? (
          <AgentArt active={active} />
        ) : index === 2 ? (
          <DashboardArt active={active} />
        ) : index === 3 ? (
          <ReminderArt active={active} />
        ) : (
          <PluginArt active={active} />
        )}
      </Animated.View>
      <Animated.View className="gap-3" style={enter}>
        <Animated.View style={kicker}>
          <Text variant="micro" tone="accent">
            {t(`welcome.intro.${page}.kicker`)}
          </Text>
        </Animated.View>
        <Animated.View style={title}>
          <Text variant="display">{t(`welcome.intro.${page}.title`)}</Text>
        </Animated.View>
        <Animated.View style={body}>
          <Text variant="body" tone="muted">
            {t(`welcome.intro.${page}.body`)}
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * The intro: five pages over the aurora (the first one the 3D hero), then the terms. `live`
 * false (leaving for setup) freezes the 3D scene.
 */
export function Intro({ onAccept, startAtEnd = false, live, forceFallback }: { onAccept: () => void; startAtEnd?: boolean; live: boolean; forceFallback: boolean }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const scroll = useSharedValue(0);
  const pager = useAnimatedRef<Animated.ScrollView>();
  const [page, setPage] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const last = page === PAGES.length - 1;
  const heroSize = Math.round(Math.min(width - spacing.xxl * 2, height * 0.38, 340));

  const onScroll = useAnimatedScrollHandler((e) => {
    scroll.set(e.contentOffset.x);
  });
  const pageProgress = useSharedValue(0);
  // Page index follows the scroll position (programmatic scrolls fire no momentum events).
  useAnimatedReaction(
    () => Math.round(scroll.get() / width),
    (p, prev) => {
      if (prev == null || p === prev) return;
      pageProgress.set(p);
      scheduleOnRN(setPage, p);
      scheduleOnRN(haptics.select);
    },
  );
  const goTo = (p: number, animated = true) => {
    scheduleOnUI(() => {
      'worklet';
      scrollTo(pager, p * width, 0, animated);
    });
  };

  // Coming back from setup lands on the terms page.
  useEffect(() => {
    if (startAtEnd) requestAnimationFrame(() => goTo(PAGES.length - 1, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = () => {
    if (!last) {
      haptics.tap();
      goTo(page + 1);
      return;
    }
    onAccept();
  };

  // Copy and footer arrive after the mark assembles. Style animations (not layout `entering`),
  // so the buttons stay interactive on Android.
  const copyIn = useSharedValue(startAtEnd || reduced ? 1 : 0);
  const footerIn = useSharedValue(startAtEnd || reduced ? 1 : 0);
  useEffect(() => {
    copyIn.set(withDelay(COPY_DELAY_MS, withTiming(1, { duration: duration.slow + 200, easing: EASE_OUT })));
    footerIn.set(withDelay(FOOTER_DELAY_MS, withTiming(1, { duration: duration.slow + 100, easing: EASE_OUT })));
  }, [copyIn, footerIn]);
  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerIn.get(),
    transform: [{ translateY: (1 - footerIn.get()) * 16 }],
  }));
  const consentStyle = useAnimatedStyle(() => {
    const d = Math.abs(scroll.get() / width - (PAGES.length - 1));
    return { opacity: interpolate(d, [0, 0.5], [1, 0], 'clamp'), transform: [{ translateY: interpolate(d, [0, 0.5], [0, 8], 'clamp') }] };
  });

  const toggle = (v: boolean) => {
    haptics.select();
    setAgreed(v);
  };

  return (
    <View className="flex-1">
      <Aurora shift={pageProgress} />
      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + spacing.xl }}>
        {PAGES.map((p, i) => (
          <PageView key={p} page={p} index={i} scroll={scroll} width={width} current={page} intro={copyIn} heroSize={heroSize} forceFallback={forceFallback} live={live} />
        ))}
      </Animated.ScrollView>

      <Animated.View className="gap-3 px-6" style={[{ paddingBottom: insets.bottom + spacing.lg }, footerStyle]}>
        <View className="mb-2 flex-row gap-1 self-center" accessibilityRole="progressbar" accessibilityLabel={t('welcome.intro.pageA11y', { page: page + 1, total: PAGES.length })}>
          {PAGES.map((p, i) => (
            <Dot key={p} scroll={scroll} index={i} width={width} />
          ))}
        </View>
        {last ? (
          <Animated.View className="flex-row items-center gap-2" style={consentStyle}>
            <NativeCheckbox label={t('welcome.intro.consentLabel')} value={agreed} onValueChange={toggle} />
            <Pressable className="flex-1" onPress={() => toggle(!agreed)} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} accessibilityLabel={t('welcome.intro.consentLabel')}>
              <Text variant="caption" tone="muted">
                {t('welcome.intro.consent')}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
        <Button title={last ? t('welcome.intro.accept') : t('welcome.intro.next')} size="lg" onPress={next} disabled={last && !agreed} />
        {/* Keeps its slot on the last page so the primary button doesn't jump. */}
        <View className={last ? 'opacity-0' : undefined} pointerEvents={last ? 'none' : 'auto'} accessibilityElementsHidden={last}>
          <Button title={t('welcome.intro.skip')} variant="ghost" size="sm" onPress={() => goTo(PAGES.length - 1)} />
        </View>
      </Animated.View>
    </View>
  );
}
