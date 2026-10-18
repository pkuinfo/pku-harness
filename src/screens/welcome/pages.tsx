import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AgentOrb } from '@/components/agent-orb';
import { AnimatedNumber } from '@/components/animated-number';
import { Icon, type IconName } from '@/components/icon';
import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { curves, glassTokens, radius, spacing, useTheme, useThemeName } from '@/theme';

const EASE_OUT = Easing.bezier(...curves.out);

/**
 * Parallax for a page's layers: as the pager moves, deeper layers (higher depth) travel
 * further and fade, so pages feel stacked in space rather than slid like cards.
 */
export function useParallax(scroll: SharedValue<number>, index: number, width: number, depth: number) {
  return useAnimatedStyle(() => {
    const d = scroll.get() / width - index;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.7], [1, 0], 'clamp'),
      transform: [{ translateX: -d * width * 0.35 * depth }, { scale: interpolate(Math.abs(d), [0, 1], [1, 0.92], 'clamp') }],
    };
  });
}

/** A glass chip in RN (for content that must stay crisp text over the backdrop). */
export function GlassChip({ icon, label, style }: { icon?: IconName; label: string; style?: object }) {
  const c = useTheme();
  const g = glassTokens[useThemeName()];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: g.surface, borderColor: g.rim[0], backgroundImage: `linear-gradient(180deg, ${g.sheen[0]}, ${g.sheen[1]})` },
        style,
      ]}>
      {icon ? <Icon name={icon} size={16} color={c.accent} /> : null}
      <Text variant="callout">{label}</Text>
    </View>
  );
}

export function HeroArt() {
  return <Logo size={132} intro orbiting />;
}

/** Three chat bubbles that type themselves in, looping gently. */
export function AgentArt({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const lines = ['每天早上 8 点查校园卡余额', '低于 ¥100 就提醒我', '好的，已创建：每天 08:00 · 低于 ¥100 通知'];
  return (
    <View style={{ alignItems: 'center', gap: spacing.xl }}>
      <AgentOrb size={120} state={active ? 'thinking' : 'idle'} />
      <View style={{ gap: spacing.sm, width: '100%' }}>
        {lines.map((l, i) => (
          <Bubble key={l} text={l} mine={i < 2} delay={reduced ? 0 : 300 + i * 650} active={active} />
        ))}
      </View>
    </View>
  );
}

function Bubble({ text, mine, delay, active }: { text: string; mine: boolean; delay: number; active: boolean }) {
  const c = useTheme();
  const g = glassTokens[useThemeName()];
  const style = useAnimatedStyle(() => ({
    opacity: withDelay(active ? delay : 0, withTiming(active ? 1 : 0, { duration: 420, easing: EASE_OUT })),
    transform: [{ translateY: withDelay(active ? delay : 0, withTiming(active ? 0 : 12, { duration: 420, easing: EASE_OUT })) }],
  }));
  return (
    <Animated.View
      style={[
        styles.bubble,
        mine
          ? { alignSelf: 'flex-end', backgroundColor: c.accent }
          : { alignSelf: 'flex-start', backgroundColor: g.surface, borderColor: g.rim[0], borderWidth: StyleSheet.hairlineWidth },
        style,
      ]}>
      <Text variant="callout" tone={mine ? 'onAccent' : 'default'}>
        {text}
      </Text>
    </Animated.View>
  );
}

/** Numbers that roll in when the page becomes active. */
export function DashboardArt({ active }: { active: boolean }) {
  const [vals, setVals] = useState([0, 0, 0]);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setVals([128.4, 36, 6]), 250);
    return () => clearTimeout(t);
  }, [active]);
  const g = glassTokens[useThemeName()];
  const tiles: { label: string; icon: IconName; value: number; fmt: (n: number) => string; wide?: boolean }[] = [
    { label: '校园卡余额（示例）', icon: 'card', value: vals[0], fmt: (n) => `¥${n.toFixed(2)}`, wide: true },
    { label: '网费', icon: 'wifi', value: vals[1], fmt: (n) => `¥${n.toFixed(0)}` },
    { label: '教学周', icon: 'schedule', value: vals[2], fmt: (n) => `第 ${n.toFixed(0)} 周` },
  ];
  return (
    <View style={styles.tiles}>
      {tiles.map((t) => (
        <View key={t.label} style={[styles.tile, t.wide && { flexBasis: '100%' }, { backgroundColor: g.surface, borderColor: g.rim[0] }]}>
          <View style={styles.tileHead}>
            <Icon name={t.icon} size={14} />
            <Text variant="caption" tone="muted">
              {t.label}
            </Text>
          </View>
          <AnimatedNumber value={t.value} format={t.fmt} variant={t.wide ? 'numberXL' : 'numberL'} />
        </View>
      ))}
    </View>
  );
}

/** A vertical timeline whose dots pulse in sequence. */
export function ReminderArt({ active }: { active: boolean }) {
  const items = [
    { time: '07:45', text: '高等数学 · 理教 107', icon: 'book' as IconName },
    { time: '12:00', text: '交实验报告', icon: 'todo' as IconName },
    { time: '每 3 天', text: '交水费 · 共 16 次', icon: 'repeat' as IconName },
  ];
  return (
    <View style={{ gap: spacing.md, width: '100%' }}>
      {items.map((it, i) => (
        <TimelineRow key={it.time} {...it} index={i} active={active} />
      ))}
    </View>
  );
}

function TimelineRow({ time, text, icon, index, active }: { time: string; text: string; icon: IconName; index: number; active: boolean }) {
  const c = useTheme();
  const g = glassTokens[useThemeName()];
  const reduced = useReducedMotion();
  const enter = useAnimatedStyle(() => ({
    opacity: withDelay(active ? 200 + index * 220 : 0, withTiming(active ? 1 : 0, { duration: 380, easing: EASE_OUT })),
    transform: [{ translateX: withDelay(active ? 200 + index * 220 : 0, withTiming(active ? 0 : -16, { duration: 380, easing: EASE_OUT })) }],
  }));
  const pulse = useAnimatedStyle(() => ({
    transform: [
      {
        scale:
          active && !reduced
            ? withDelay(900 + index * 500, withRepeat(withSequence(withTiming(1.35, { duration: 260 }), withTiming(1, { duration: 520 })), -1, false))
            : 1,
      },
    ],
  }));
  return (
    <Animated.View style={[styles.row, { backgroundColor: g.surface, borderColor: g.rim[0] }, enter]}>
      <Animated.View style={[styles.dot, { backgroundColor: c.accent }, pulse]} />
      <Text variant="bodyStrong" style={{ width: 64, fontVariant: ['tabular-nums'] }}>
        {time}
      </Text>
      <Text variant="callout" style={{ flex: 1 }}>
        {text}
      </Text>
      <Icon name={icon} size={16} color={c.textMuted} />
    </Animated.View>
  );
}

/** Plugin chips drifting on slow, offset sine paths. */
export function PluginArt({ active }: { active: boolean }) {
  const chips: { icon: IconName; label: string }[] = [
    { icon: 'card', label: '校园卡' },
    { icon: 'book', label: '课表' },
    { icon: 'sparkles', label: 'DeepSeek' },
    { icon: 'wifi', label: '网费' },
    { icon: 'globe', label: '树洞' },
    { icon: 'todo', label: '待办' },
    { icon: 'puzzle', label: '社区插件' },
  ];
  return (
    <View style={styles.cloud}>
      {chips.map((ch, i) => (
        <Drifting key={ch.label} index={i} active={active}>
          <GlassChip icon={ch.icon} label={ch.label} />
        </Drifting>
      ))}
    </View>
  );
}

function Drifting({ index, active, children }: { index: number; active: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(() => ({
    opacity: withDelay(active ? index * 90 : 0, withTiming(active ? 1 : 0, { duration: 400 })),
    transform: [
      {
        translateY:
          active && !reduced
            ? withRepeat(withSequence(withTiming(-6, { duration: 1600 + index * 230, easing: Easing.inOut(Easing.sin) }), withTiming(6, { duration: 1600 + index * 230, easing: Easing.inOut(Easing.sin) })), -1, true)
            : 0,
      },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubble: { maxWidth: '82%', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.xl, borderCurve: 'continuous' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, width: '100%' },
  tile: {
    flexGrow: 1,
    flexBasis: '40%',
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  cloud: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.sm },
});
