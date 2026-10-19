import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { approvals, useApproval } from '@/core/runtime/approvals';
import { registry } from '@/core/runtime/registry';
import { radius, shadows, spacing, springs, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Button } from './button';
import { Chip, type ChipTone } from './chip';
import { Icon } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

const EFFECT: Record<string, { label: string; tone: ChipTone }> = {
  read: { label: '读取', tone: 'info' },
  write: { label: '修改', tone: 'warn' },
  money: { label: '资金', tone: 'down' },
  public: { label: '公开', tone: 'accent' },
};

/** Compact, readable preview of tool input (top-level fields only). */
function preview(input: unknown): [string, string][] {
  if (!input || typeof input !== 'object') return [];
  return Object.entries(input as Record<string, unknown>)
    .slice(0, 6)
    .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
    .map(([k, v]) => [k, v.length > 80 ? `${v.slice(0, 80)}…` : v]);
}

/**
 * The "ask first" prompt: slides up over any screen when the agent wants to run a tool whose
 * effect the user set to 每次询问. Mounted once in the root layout.
 */
export function ApprovalPrompt() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const req = useApproval();
  if (!req) return null;
  const plugin = registry.get(req.entry.pluginId);
  const effect = EFFECT[req.entry.def.effect];
  const fields = preview(req.input);

  const answer = (ok: boolean, always = false) => {
    if (ok) haptics.success();
    else haptics.warning();
    approvals.answer(req.id, ok, always);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={FadeIn} exiting={FadeOut} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} />
      <Animated.View
        key={req.id}
        entering={SlideInDown.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness)}
        exiting={SlideOutDown}
        accessibilityViewIsModal
        style={[styles.card, { backgroundColor: c.elevated, paddingBottom: Math.max(insets.bottom, spacing.lg), boxShadow: shadows.overlay }]}>
        <View style={styles.head}>
          <View style={[styles.icon, { backgroundColor: c.accentMuted }]}>
            <Icon name="shield" size={20} color={c.accent} />
          </View>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text variant="micro" tone="faint">
              AI 请求执行
            </Text>
            <Text variant="headline">{req.entry.def.title}</Text>
          </View>
          <Chip label={effect.label} tone={effect.tone} />
        </View>
        <Text variant="callout" tone="muted">
          来自「{plugin?.name ?? req.entry.pluginId}」{plugin?.remote ? ' · 第三方远程插件' : ''}。你设置了这类操作需要确认。
        </Text>
        {fields.length ? (
          <View style={[styles.fields, { backgroundColor: c.surface2 }]}>
            {fields.map(([k, v]) => (
              <View key={k} style={styles.field}>
                <Text variant="caption" tone="faint" style={styles.key}>
                  {k}
                </Text>
                <Text variant="caption" style={{ flex: 1 }} selectable>
                  {v}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button title="拒绝" variant="secondary" onPress={() => answer(false)} style={{ flex: 1 }} />
          <Button title="允许" onPress={() => answer(true)} style={{ flex: 2 }} />
        </View>
        <PressableScale accessibilityRole="button" accessibilityLabel="允许并以后不再询问" haptic={false} onPress={() => answer(true, true)} style={styles.always}>
          <Text variant="caption" tone="muted">
            允许，以后同类操作不再询问
          </Text>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  fields: { borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xs },
  field: { flexDirection: 'row', gap: spacing.sm },
  key: { width: 72 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  always: { alignSelf: 'center', paddingVertical: spacing.xs },
});
