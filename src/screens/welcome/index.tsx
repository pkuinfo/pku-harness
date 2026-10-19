import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { NativeCheckbox } from '@/components/native-checkbox';
import { Aurora } from '@/components/aurora';
import { Text } from '@/components/text';
import { markOnboarded } from '@/core/boot';
import { kv } from '@/core/store/kv';
import { curves, radius, spacing, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { AgentArt, DashboardArt, HeroArt, PluginArt, ReminderArt, useParallax } from './pages';

const EASE_OUT = Easing.bezier(...curves.out);

type Page = { kicker: string; title: string; body: string };

const PAGES: Page[] = [
  { kicker: 'PKU HARNESS', title: '整个燕园，\n一个入口', body: '登录一次，课表、校园卡、网费、树洞……都由一个懂你的助手接管。' },
  { kicker: '对话即操作', title: '说一句，\n它就去做', body: 'AI 直接调用校园服务，需要你确认时会生成原生表单，而不是让你打字。' },
  { kicker: '看板', title: '关心的数字，\n一眼看到', body: '告诉 AI 你想盯住什么，它会搭好看板并保持更新。' },
  { kicker: '提醒', title: '准时，\n精确到分钟', body: '「每 3 天，共 16 次」这样的说法也能听懂。提醒在本机由系统闹钟送达。' },
  { kicker: '一切皆插件', title: '我们只做框架，\n内容来自社区', body: '每个能力都是一个插件，内置的和社区的平等。凭据只存在你的手机上。' },
];

export const ONBOARDED_KEY = 'onboarded';

function Dot({ scroll, index, width }: { scroll: ReturnType<typeof useSharedValue<number>>; index: number; width: number }) {
  const c = useTheme();
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scroll.get() / width - index);
    return { width: interpolate(d, [0, 1], [22, 6], 'clamp'), opacity: interpolate(d, [0, 1], [1, 0.35], 'clamp') };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: c.text }, style]} />;
}

function PageView({ page, index, scroll, width, active, near }: { page: Page; index: number; scroll: ReturnType<typeof useSharedValue<number>>; width: number; active: boolean; near: boolean }) {
  const art = useParallax(scroll, index, width, 1.4);
  const copy = useParallax(scroll, index, width, 0.6);
  return (
    <View style={[styles.page, { width }]}>
      <Animated.View style={[styles.art, art]}>
        {/* Only the current page and its neighbours mount their (animated) art. */}
        {!near ? null : index === 0 ? <HeroArt /> : index === 1 ? <AgentArt active={active} /> : index === 2 ? <DashboardArt active={active} /> : index === 3 ? <ReminderArt active={active} /> : <PluginArt active={active} />}
      </Animated.View>
      <Animated.View style={[styles.copy, copy]}>
        <Text variant="micro" tone="accent">
          {page.kicker}
        </Text>
        <Text variant="display" style={styles.title}>
          {page.title}
        </Text>
        <Text variant="body" tone="muted">
          {page.body}
        </Text>
      </Animated.View>
    </View>
  );
}

/** First-run welcome: shader backdrop, parallax pages, consent, then into the app. */
export function Welcome() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroll = useSharedValue(0);
  const pager = useAnimatedRef<Animated.ScrollView>();
  const [page, setPage] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const last = page === PAGES.length - 1;

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
  const goTo = (p: number) => {
    scheduleOnUI(() => {
      'worklet';
      scrollTo(pager, p * width, 0, true);
    });
  };

  const next = async () => {
    haptics.tap();
    if (!last) {
      goTo(page + 1);
      return;
    }
    await kv('prefs').set(ONBOARDED_KEY, true);
    markOnboarded();
    haptics.success();
    router.replace('/ai-settings');
  };

  // Footer arrives after the logo draws on. A style animation (not a layout `entering`
  // animation), so the buttons stay interactive on Android.
  const footerIn = useSharedValue(0);
  useEffect(() => {
    footerIn.set(withDelay(900, withTiming(1, { duration: 500, easing: EASE_OUT })));
  }, [footerIn]);
  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerIn.get(),
    transform: [{ translateY: (1 - footerIn.get()) * 16 }],
  }));

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Aurora shift={pageProgress} />
      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + spacing.xxl }}>
        {PAGES.map((p, i) => (
          <PageView key={p.kicker} page={p} index={i} scroll={scroll} width={width} active={page === i} near={Math.abs(page - i) <= 1} />
        ))}
      </Animated.ScrollView>

      <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }, footerStyle]}>
        <View style={styles.dots}>
          {PAGES.map((p, i) => (
            <Dot key={p.kicker} scroll={scroll} index={i} width={width} />
          ))}
        </View>
        {last ? (
          <Animated.View entering={FadeIn} style={styles.consent}>
            <NativeCheckbox label="同意条款" value={agreed} onValueChange={setAgreed} />
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>
              我已了解：AI 会按我在设置里授予的权限代我操作校园服务；校园密码只保存在本机。
            </Text>
          </Animated.View>
        ) : null}
        <Button title={last ? '开始使用' : '继续'} size="lg" onPress={next} disabled={last && !agreed} />
        {!last ? (
          <Button
            title="跳过"
            variant="ghost"
            size="sm"
            onPress={() => goTo(PAGES.length - 1)}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.xxl },
  art: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: spacing.md },
  title: { lineHeight: 50 },
  footer: { paddingHorizontal: spacing.xl, gap: spacing.md },
  dots: { flexDirection: 'row', gap: spacing.xs, alignSelf: 'center', marginBottom: spacing.sm },
  dot: { height: 6, borderRadius: radius.full },
  consent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
