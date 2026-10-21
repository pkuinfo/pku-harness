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
import { formatCompact, formatPercent } from '@/core/usage/format';
import { useContextBreakdown, useSessionCache } from '@/core/usage/hooks';
import { useT } from '@/i18n';
import { spacing } from '@/theme';
import { haptics } from '@/utils/haptics';

type Outcome = { tone: 'muted' | 'up' | 'down'; text: string } | null;

/** Context sheet (docs/AGENT-HARNESS.md §6.3): what fills the active session's context. */
export function ContextSheet() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const sid = useActiveSessionId();
  const b = useContextBreakdown(sid);
  const cache = useSessionCache(sid);
  const streaming = useChatSelector((s) => s.status === 'streaming');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const values = [b.systemTokens, b.toolsTokens, b.contextTokens, b.conversationTokens, b.toolResultTokens];
  const labels = [t('chat.context.system'), t('chat.context.tools'), t('chat.context.plugins'), t('chat.context.conversation'), t('chat.context.toolResults')];
  const ratio = b.budget > 0 ? b.total / b.budget : 0;
  const tone = ratio >= 0.85 ? 'down' : ratio >= 0.6 ? 'warn' : 'default';

  const compact = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const r = await compactNow(sid);
      if (r) {
        haptics.success();
        setOutcome({ tone: 'up', text: t('chat.message.compacted', { count: r.compactedMessages, before: formatCompact(r.tokensBefore), after: formatCompact(r.tokensAfter) }) });
      } else setOutcome({ tone: 'muted', text: t('chat.context.nothingToCompact') });
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
          {t('chat.context.title')}
        </Text>
        <IconButton icon="close" label={t('core.common.close')} variant="ghost" size={36} onPress={() => dismiss('/')} />
      </View>

      <View className="gap-1">
        <View className="flex-row items-baseline gap-1.5" accessible accessibilityLabel={t('chat.context.usedA11y', { used: formatCompact(b.total), budget: formatCompact(b.budget), pct: formatPercent(ratio) })}>
          <Text variant="numberXL" tone={tone}>
            {formatCompact(b.total)}
          </Text>
          <Text variant="numberM" tone="faint">
            / {formatCompact(b.budget)}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          {t('chat.context.window', { window: formatCompact(b.window) })}
        </Text>
      </View>

      <View className="gap-3">
        <StackedBar values={values} colors={CONTEXT_SERIES} capacity={b.budget} accessibilityLabel={t('chat.context.barA11y', { pct: formatPercent(ratio) })} />
        <Legend columns items={labels.map((label, i) => ({ label, color: CONTEXT_SERIES[i], value: formatCompact(values[i]) }))} />
        <Text variant="caption" tone="faint">
          {`${b.compactions > 0 ? t('chat.context.compactedTimes', { count: b.compactions }) : t('chat.context.neverCompacted')} · ${t(b.reportedInputTokens ? 'chat.context.calibrated' : 'chat.context.estimated')}`}
        </Text>
        {cache && cache.last !== null && cache.session.rate !== null ? (
          <Text variant="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
            {t('chat.context.cacheLine', { last: formatPercent(cache.last), session: formatPercent(cache.session.rate) })}
          </Text>
        ) : null}
      </View>

      {outcome ? (
        <Text variant="callout" tone={outcome.tone} accessibilityLiveRegion="polite">
          {outcome.text}
        </Text>
      ) : null}

      <View className="gap-2">
        <Button
          title={t('chat.context.compact')}
          variant="secondary"
          icon="refresh"
          loading={busy}
          disabled={streaming || b.total <= 0}
          onPress={compact}
        />
        {streaming ? (
          <Text variant="caption" tone="faint" align="center">
            {t('chat.context.afterReply')}
          </Text>
        ) : null}
        <Button
          title={t('chat.header.newChat')}
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
