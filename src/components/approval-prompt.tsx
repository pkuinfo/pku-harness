import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { approvals, useApproval } from '@/core/runtime/approvals';
import { pluginName, toolTitle } from '@/core/runtime/localize';
import { registry } from '@/core/runtime/registry';
import { useT } from '@/i18n';
import { shadows, spacing, springs, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Button } from './button';
import { Chip, type ChipTone } from './chip';
import { Icon } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

const CURVE = { borderCurve: 'continuous' } as const;

const EFFECT = {
  read: { label: 'chat.approval.read', tone: 'info' },
  write: { label: 'chat.approval.write', tone: 'warn' },
  money: { label: 'chat.approval.money', tone: 'down' },
  public: { label: 'chat.approval.public', tone: 'accent' },
} as const satisfies Record<string, { label: string; tone: ChipTone }>;

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
  const t = useT();
  const insets = useSafeAreaInsets();
  const req = useApproval();
  if (!req) return null;
  const plugin = registry.get(req.entry.pluginId);
  const effect = EFFECT[req.entry.def.effect as keyof typeof EFFECT];
  const from = { plugin: plugin ? pluginName(plugin) : req.entry.pluginId };
  const fields = preview(req.input);

  const answer = (ok: boolean, always = false) => {
    if (ok) haptics.success();
    else haptics.warning();
    approvals.answer(req.id, ok, always);
  };

  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      <Animated.View entering={FadeIn} exiting={FadeOut} className="absolute inset-0" style={{ backgroundColor: c.scrim }} />
      <Animated.View
        key={req.id}
        entering={SlideInDown.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness)}
        exiting={SlideOutDown}
        accessibilityViewIsModal
        className="absolute bottom-2 left-2 right-2 gap-3 rounded-xl bg-elevated p-4"
        style={{ borderCurve: 'continuous', paddingBottom: Math.max(insets.bottom, spacing.lg), boxShadow: shadows.overlay }}>
        <View className="flex-row items-center gap-3">
          <View className="size-10 items-center justify-center rounded-md bg-accent-muted" style={CURVE}>
            <Icon name="shield" size={20} color={c.accent} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="micro" tone="faint">
              {t('chat.approval.eyebrow')}
            </Text>
            <Text variant="headline">{toolTitle(plugin, req.entry.name, req.entry.def.title)}</Text>
          </View>
          {effect ? <Chip label={t(effect.label)} tone={effect.tone} /> : null}
        </View>
        <Text variant="callout" tone="muted">
          {t(plugin?.remote ? 'chat.approval.fromRemote' : 'chat.approval.from', from)}
        </Text>
        {fields.length ? (
          <View className="gap-1 rounded-md bg-surface-2 p-3" style={CURVE}>
            {fields.map(([k, v]) => (
              <View key={k} className="flex-row gap-2">
                <Text variant="caption" tone="faint" className="w-[72px]">
                  {k}
                </Text>
                <Text variant="caption" className="flex-1" selectable>
                  {v}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View className="flex-row gap-2">
          <Button title={t('chat.approval.deny')} variant="secondary" onPress={() => answer(false)} className="flex-1" />
          <Button title={t('chat.approval.allow')} onPress={() => answer(true)} className="flex-[2]" />
        </View>
        <PressableScale accessibilityRole="button" accessibilityLabel={t('chat.approval.alwaysA11y')} haptic={false} onPress={() => answer(true, true)} className="self-center py-1">
          <Text variant="caption" tone="muted">
            {t('chat.approval.always')}
          </Text>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

