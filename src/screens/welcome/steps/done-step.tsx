import { useMemo, useSyncExternalStore } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { FadeIn } from '@/components/fade-in';
import { Glass } from '@/components/glass';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { useAIConfig } from '@/core/agent/provider';
import { useCampusAccount } from '@/core/campus/account';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { radius, spacing, useTheme } from '@/theme';

import { suggestionsFor } from '../flow';
import { BrandHero } from '../scene/brand-hero';
import { StepShell } from './step-shell';

function SummaryRow({ icon, label, value, ok, index }: { icon: IconName; label: string; value: string; ok: boolean; index: number }) {
  const c = useTheme();
  return (
    <FadeIn index={index}>
      <View className="flex-row items-center gap-3 py-2">
        <Icon name={icon} size={18} color={ok ? c.up : c.textFaint} />
        <Text variant="callout" tone="muted" className="w-20">
          {label}
        </Text>
        <Text variant="callout" tone={ok ? 'default' : 'faint'} className="flex-1" numberOfLines={1}>
          {value}
        </Text>
      </View>
    </FadeIn>
  );
}

/** Step 4 · 完成: what was set up, and two or three first questions that fit it. */
export function DoneStep({ onFinish, onBack, live, forceFallback }: { onFinish: (question?: string) => void; onBack: () => void; live: boolean; forceFallback: boolean }) {
  const { width } = useWindowDimensions();
  const { config, hasKey } = useAIConfig();
  const account = useCampusAccount();
  const plugins = usePlugins();
  // Subscribe to settings so the count follows toggles made a moment ago.
  const stored = useSyncExternalStore(pluginSettings.subscribe, pluginSettings.snapshot);
  // Keyed on `stored` so a toggle re-derives it; `get` adds manifest defaults and core plugins.
  const enabled = useMemo(
    () => (stored ? new Set(plugins.filter((p) => !p.remote && !registry.unavailable(p.id) && pluginSettings.get(p.id).enabled).map((p) => p.id)) : new Set<string>()),
    [plugins, stored],
  );
  const services = plugins.filter((p) => !p.core && !p.providers && !p.remote && enabled.has(p.id)).length;
  const suggestions = suggestionsFor({ ai: hasKey, campus: account.signedIn, enabled });
  const heroSize = Math.round(Math.min(width - spacing.xxxl * 2, 220));

  return (
    <StepShell
      step="done"
      title="准备好了"
      why={hasKey ? '试着问它一个问题，或者直接开始。' : '还没连接 AI 服务，可以稍后在 设置 → AI 服务 中连接。'}
      hero={
        <View className="items-center">
          <BrandHero size={heroSize} active={live} mode="celebrate" forceFallback={forceFallback} />
        </View>
      }
      primary="开始使用"
      onPrimary={() => onFinish()}
      onBack={onBack}>
      <View>
        <SummaryRow index={3} icon="sparkles" label="AI 服务" ok={hasKey} value={hasKey ? `${config.name} · ${config.model}` : '未连接'} />
        <SummaryRow index={4} icon="person" label="北大账号" ok={account.signedIn} value={account.signedIn ? (account.name ?? account.username ?? '已登录') : '未登录'} />
        <SummaryRow index={5} icon="puzzle" label="校园服务" ok={services > 0} value={`已开启 ${services} 个`} />
      </View>
      {suggestions.length ? (
        <View className="gap-2">
          <FadeIn index={6}>
            <Text variant="micro" tone="faint">
              可以这样开始
            </Text>
          </FadeIn>
          {suggestions.map((q, i) => (
            <FadeIn key={q} index={7 + i}>
              <Glass radius={radius.md} tone="strong" onPress={() => onFinish(q)} accessibilityLabel={q} accessibilityRole="button">
                <View className="flex-row items-center gap-3 px-4 py-3">
                  <Text variant="body" className="flex-1">
                    {q}
                  </Text>
                  <Icon name="send" size={16} />
                </View>
              </Glass>
            </FadeIn>
          ))}
        </View>
      ) : null}
    </StepShell>
  );
}
