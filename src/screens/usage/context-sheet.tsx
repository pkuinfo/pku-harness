import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { Legend } from '@/components/charts/legend';
import { CONTEXT_SERIES } from '@/components/charts/palette';
import { StackedBar } from '@/components/charts/stacked-bar';
import { dismiss } from '@/components/sheet-screen';
import { Text } from '@/components/text';
import { useChatSelector } from '@/core/agent/session/chat-store';
import { compactNow } from '@/core/agent/context/compaction';
import { sessions, useActiveSessionId } from '@/core/agent/session/sessions';
import { formatCompact, formatInt, formatPercent } from '@/core/usage/format';
import { useContextBreakdown } from '@/core/usage/hooks';
import { spacing } from '@/theme';
import { haptics } from '@/utils/haptics';

type Outcome = { tone: 'muted' | 'up' | 'down'; text: string } | null;

/** Context sheet (docs/AGENT-HARNESS.md §6.3): what fills the active session's context. */
export function ContextSheet() {
  const insets = useSafeAreaInsets();
  const sid = useActiveSessionId();
  const b = useContextBreakdown(sid);
  const streaming = useChatSelector((s) => s.status === 'streaming');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const values = [b.systemTokens, b.toolsTokens, b.contextTokens, b.conversationTokens, b.toolResultTokens];
  const labels = ['系统提示', '工具定义', '插件上下文', '对话', '工具结果'];
  const ratio = b.budget > 0 ? b.total / b.budget : 0;
  const tone = ratio >= 0.85 ? 'down' : ratio >= 0.6 ? 'warn' : 'default';

  const compact = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const r = await compactNow(sid);
      if (r) {
        haptics.success();
        setOutcome({ tone: 'up', text: `已压缩 ${formatInt(r.compactedMessages)} 条消息 · ${formatCompact(r.tokensBefore)} → ${formatCompact(r.tokensAfter)} tokens` });
      } else setOutcome({ tone: 'muted', text: '还没有可以压缩的内容' });
    } catch (e) {
      haptics.warning();
      setOutcome({ tone: 'down', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-5 px-4 pt-4" style={{ paddingBottom: Math.max(insets.bottom, spacing.lg) }}>
      <View className="flex-row items-center">
        <Text variant="headline" className="flex-1">
          上下文
        </Text>
        <IconButton icon="close" label="关闭" variant="ghost" size={36} onPress={() => dismiss('/')} />
      </View>

      <View className="gap-1">
        <View className="flex-row items-baseline gap-1.5" accessible accessibilityLabel={`已用 ${formatCompact(b.total)}，预算 ${formatCompact(b.budget)}，${formatPercent(ratio)}`}>
          <Text variant="numberXL" tone={tone}>
            {formatCompact(b.total)}
          </Text>
          <Text variant="numberM" tone="faint">
            / {formatCompact(b.budget)}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          {`模型上下文 ${formatCompact(b.window)} · 超过预算会自动压缩较早的对话`}
        </Text>
      </View>

      <View className="gap-3">
        <StackedBar values={values} colors={CONTEXT_SERIES} capacity={b.budget} accessibilityLabel={`上下文占预算 ${formatPercent(ratio)}`} />
        <Legend columns items={labels.map((label, i) => ({ label, color: CONTEXT_SERIES[i], value: formatCompact(values[i]) }))} />
        <Text variant="caption" tone="faint">
          {b.compactions > 0 ? `已压缩 ${b.compactions} 次` : '还没有压缩过'}
          {b.reportedInputTokens ? ' · 按服务商上次报告的用量校准' : ' · 估算值'}
        </Text>
      </View>

      {outcome ? (
        <Text variant="callout" tone={outcome.tone} accessibilityLiveRegion="polite">
          {outcome.text}
        </Text>
      ) : null}

      <View className="gap-2">
        <Button
          title="压缩上下文"
          variant="secondary"
          icon="refresh"
          loading={busy}
          disabled={streaming || b.total <= 0}
          onPress={compact}
        />
        {streaming ? (
          <Text variant="caption" tone="faint" align="center">
            回复结束后可用
          </Text>
        ) : null}
        <Button
          title="新对话"
          variant="ghost"
          icon="plus"
          onPress={async () => {
            await sessions.create();
            dismiss('/');
          }}
        />
      </View>
    </View>
  );
}
