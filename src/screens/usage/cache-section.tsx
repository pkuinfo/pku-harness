import { useState } from 'react';
import { View } from 'react-native';

import { AnimatedNumber } from '@/components/animated-number';
import { ColumnChart } from '@/components/charts/column-chart';
import { CACHE_HIT } from '@/components/charts/palette';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import type { CacheStats } from '@/core/usage/aggregate';
import { formatCompact, formatInt, formatMonies, formatPercent, formatShortDay } from '@/core/usage/format';
import type { UsagePurpose } from '@/core/usage/types';
import { useLocale, useT, type MessageKey } from '@/i18n';
import { useTheme } from '@/theme';

import { RankedRow } from './ranked-row';
import { Section } from './section';

const PURPOSE_LABEL: Record<UsagePurpose, MessageKey> = {
  chat: 'app.usage.purposeChat',
  title: 'app.usage.purposeTitle',
  compaction: 'app.usage.purposeCompaction',
  scheduler: 'app.usage.purposeScheduler',
};
const count = (n: number) => (n === 1 ? 1 : formatInt(n));

/**
 * The prompt cache, first-class: the chat hit rate (THE metric, see `cacheStats`), its last 14
 * days as 0–100 % columns over a track, the split by request purpose, and what it saved.
 * `discount` = how many times cheaper a hit is (from the main model's prices), if known.
 */
export function CacheSection({ cache, discount }: { cache: CacheStats; discount: number | null }) {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const [day, setDay] = useState<number | null>(null);
  const { chat, daily, byPurpose, savedMonth, missTokens } = cache;
  const d = day !== null ? daily[day] : null;
  const last = daily.length - 1;
  const dayLabel = (i: number) => (i === last ? t('core.date.today') : formatShortDay(new Date(daily[i].date), locale));

  return (
    <Section title={t('app.usage.cacheTitle')} meta={missTokens > 0 ? t('app.usage.cacheMisses', { tokens: formatCompact(missTokens) }) : undefined}>
      <View className="gap-0.5" accessible accessibilityLabel={chat.rate === null ? t('app.usage.cacheHero') : t('app.usage.cacheHeroA11y', { pct: formatPercent(chat.rate) })}>
        {chat.rate === null ? (
          <Text variant="numberXL" tone="faint">
            —
          </Text>
        ) : (
          <AnimatedNumber value={chat.rate} variant="numberXL" format={formatPercent} />
        )}
        <Text variant="caption" tone="muted">
          {t('app.usage.cacheHero')}
        </Text>
      </View>

      <View className="gap-1.5">
        <Text variant="callout" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">
          {d
            ? d.rate === null
              ? t('app.usage.cacheDayEmpty', { day: dayLabel(day!) })
              : t('app.usage.cacheDayCaption', { day: dayLabel(day!), pct: formatPercent(d.rate), count: count(d.requests) })
            : t('app.usage.tapBar')}
        </Text>
        <ColumnChart
          // Hit share over a full-height track, so every active day reads on the same 0–100 % scale.
          series={[daily.map((x) => x.rate ?? 0), daily.map((x) => (x.rate === null ? 0 : 1 - x.rate))]}
          colors={[CACHE_HIT, c.surface3]}
          height={72}
          maxBar={14}
          xLabels={[0, 7, last].map((i) => ({ index: i, label: dayLabel(i) }))}
          selected={day}
          onSelect={setDay}
          accessibilityLabel={t('app.usage.cacheChartA11y', { pct: chat.rate === null ? '—' : formatPercent(chat.rate) })}
        />
      </View>

      {byPurpose.length > 1 ? (
        <View className="gap-3">
          {byPurpose.map((p) => (
            <RankedRow
              key={p.purpose}
              title={t(PURPOSE_LABEL[p.purpose])}
              value={p.rate === null ? '—' : formatPercent(p.rate)}
              detail={t('app.usage.purposeDetail', { count: count(p.requests), tokens: formatCompact(p.input) })}
              share={p.rate ?? 0}
              color={CACHE_HIT}
            />
          ))}
        </View>
      ) : null}

      <View className="gap-1">
        {savedMonth.length ? (
          <View className="flex-row items-center gap-1.5">
            <Icon name="trendUp" size={14} color={c.up} />
            <Text variant="callout" tone="up" style={{ fontVariant: ['tabular-nums'] }}>
              {t('app.usage.cacheSaved', { amount: formatMonies(savedMonth) })}
            </Text>
          </View>
        ) : null}
        <Text variant="caption" tone="faint">
          {discount ? t('app.usage.cacheWhy', { ratio: discount }) : t('app.usage.cacheWhyGeneric')}
        </Text>
      </View>
    </Section>
  );
}
