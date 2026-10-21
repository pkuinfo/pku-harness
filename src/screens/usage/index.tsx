import { useState } from 'react';
import { View } from 'react-native';

import { AnimatedNumber } from '@/components/animated-number';
import { Button } from '@/components/button';
import { ColumnChart } from '@/components/charts/column-chart';
import { HeatMap } from '@/components/charts/heat-map';
import { Legend } from '@/components/charts/legend';
import { TOKEN_SERIES } from '@/components/charts/palette';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/fade-in';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Skeleton } from '@/components/skeleton';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { pluginName, toolTitle } from '@/core/runtime/localize';
import { registry } from '@/core/runtime/registry';
import type { ToolRange, UsageReport } from '@/core/usage/aggregate';
import { formatCompact, formatInt, formatPercent, formatShortDay } from '@/core/usage/format';
import { useToolRanking, useUsageReport, type UsageState } from '@/core/usage/hooks';
import { useLocale, useT } from '@/i18n';
import { radius, useTheme } from '@/theme';

import { RankedRow } from './ranked-row';
import { Section } from './section';

const HOURS = [0, 6, 12, 18, 23];
/** A `count` param: a number when it is 1 (so English picks the `_one` string), else grouped "1,234". */
const count = (n: number) => (n === 1 ? 1 : formatInt(n));
const TOOL_ROWS = 8;

/** Usage screen (docs/AGENT-HARNESS.md §6.4): tokens, activity, tools and models. Tokens only, no money. */
export function UsageScreen() {
  const t = useT();
  const { state, reload } = useUsageReport();
  return (
    <Screen title={t('app.usage.title')} subtitle={t('app.usage.eyebrow')} back>
      {state.status === 'loading' ? (
        <Loading />
      ) : state.status === 'error' ? (
        <EmptyState icon="warning" title={t('app.usage.loadFailed')} message={state.message} action={<Button title={t('core.common.retry')} variant="secondary" size="sm" onPress={reload} />} />
      ) : state.report.empty ? (
        <EmptyState icon="trendUp" title={t('app.usage.empty')} message={t('app.usage.emptyMessage')} />
      ) : (
        <Content state={state} report={state.report} />
      )}
    </Screen>
  );
}

function Loading() {
  return (
    <View className="gap-4">
      <View className="flex-row gap-3">
        <Skeleton height={84} rounded={radius.lg} className="flex-1" width="auto" />
        <Skeleton height={84} rounded={radius.lg} className="flex-1" width="auto" />
      </View>
      <View className="flex-row gap-3">
        <Skeleton height={84} rounded={radius.lg} className="flex-1" width="auto" />
        <Skeleton height={84} rounded={radius.lg} className="flex-1" width="auto" />
      </View>
      <Skeleton height={170} rounded={radius.lg} />
      <Skeleton height={150} rounded={radius.lg} />
    </View>
  );
}

function Kpi({ label, value, format, unit }: { label: string; value: number | null; format: (n: number) => string; unit?: string }) {
  return (
    <Surface className="flex-1 gap-1">
      <Text variant="micro" tone="faint">
        {label}
      </Text>
      {value === null ? (
        <Text variant="numberL" tone="faint">
          —
        </Text>
      ) : (
        <View className="flex-row items-baseline gap-1">
          <AnimatedNumber value={value} variant="numberL" format={format} />
          {unit ? (
            <Text variant="caption" tone="muted">
              {unit}
            </Text>
          ) : null}
        </View>
      )}
    </Surface>
  );
}

function Content({ state, report }: { state: Extract<UsageState, { status: 'ready' }>; report: UsageReport }) {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const ranges: { label: string; value: ToolRange }[] = [
    { label: t('app.usage.d7'), value: '7d' },
    { label: t('app.usage.d30'), value: '30d' },
    { label: t('app.usage.all'), value: 'all' },
  ];
  const hourLabels = HOURS.map((h) => ({ index: h, label: t('app.usage.hour', { hour: h }) }));
  const { kpis, heat, hours, days, models } = report;
  const [hour, setHour] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [range, setRange] = useState<ToolRange>('30d');
  const tools = useToolRanking(state, range);

  const peak = hours.indexOf(Math.max(...hours));
  const hourTurns = hours.reduce((a, b) => a + b, 0);
  const sum = days.reduce((a, d) => ({ cached: a.cached + d.cached, uncached: a.uncached + d.uncached, output: a.output + d.output }), { cached: 0, uncached: 0, output: 0 });
  const d = day !== null ? days[day] : null;
  const maxCalls = tools[0]?.calls ?? 1;

  return (
    <>
      <FadeIn index={0}>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <Kpi label={t('app.usage.today')} value={kpis.todayTokens} format={formatCompact} unit="tokens" />
            <Kpi label={t('app.usage.month')} value={kpis.monthTokens} format={formatCompact} unit="tokens" />
          </View>
          <View className="flex-row gap-3">
            <Kpi label={t('app.usage.cacheHit')} value={kpis.cacheHitRate} format={formatPercent} />
            <Kpi label={t('app.usage.monthTurns')} value={kpis.monthTurns} format={formatInt} unit={t('app.usage.turnsUnit')} />
          </View>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <Section title={t('app.usage.activity')} meta={t('app.usage.activityMeta', { count: count(heat.totalTurns) })}>
          <HeatMap heat={heat} />
        </Section>
      </FadeIn>

      <FadeIn index={2}>
        <Section
          title={t('app.usage.hours')}
          caption={
            hour !== null
              ? t('app.usage.hourCaption', { from: hour, to: hour + 1, count: count(hours[hour]) })
              : hourTurns > 0
                ? t('app.usage.peak', { hour: peak })
                : t('app.usage.noTurns')
          }>
          <ColumnChart
            series={[hours]}
            colors={[c.accent]}
            height={88}
            maxBar={10}
            xLabels={hourLabels}
            selected={hour}
            onSelect={setHour}
            accessibilityLabel={t('app.usage.hoursA11y', { hour: peak, count: formatInt(hours[peak] ?? 0) })}
          />
        </Section>
      </FadeIn>

      <FadeIn index={3}>
        <Section
          title={t('app.usage.tokens')}
          meta={formatCompact(sum.cached + sum.uncached + sum.output)}
          caption={
            d
              ? t('app.usage.dayCaption', { day: formatShortDay(new Date(d.date), locale), cached: formatCompact(d.cached), uncached: formatCompact(d.uncached), output: formatCompact(d.output) })
              : t('app.usage.tapBar')
          }>
          <ColumnChart
            series={[days.map((x) => x.cached), days.map((x) => x.uncached), days.map((x) => x.output)]}
            colors={TOKEN_SERIES}
            height={120}
            xLabels={[0, 7, 13].map((i) => ({ index: i, label: i === 13 ? t('core.date.today') : formatShortDay(new Date(days[i].date), locale) }))}
            selected={day}
            onSelect={setDay}
            accessibilityLabel={t('app.usage.tokensA11y', { total: formatCompact(sum.cached + sum.uncached + sum.output), cached: formatCompact(sum.cached), uncached: formatCompact(sum.uncached), output: formatCompact(sum.output) })}
          />
          <Legend
            items={[
              { label: t('app.usage.cached'), color: TOKEN_SERIES[0], value: formatCompact(sum.cached) },
              { label: t('app.usage.uncached'), color: TOKEN_SERIES[1], value: formatCompact(sum.uncached) },
              { label: t('app.usage.output'), color: TOKEN_SERIES[2], value: formatCompact(sum.output) },
            ]}
          />
        </Section>
      </FadeIn>

      <FadeIn index={4}>
        <Section title={t('app.usage.tools')}>
          <Segmented options={ranges} value={range} onChange={setRange} />
          {tools.length ? (
            <View className="gap-3.5">
              {tools.slice(0, TOOL_ROWS).map((row) => {
                const entry = registry.tool(row.toolId);
                const plugin = registry.get(row.pluginId);
                return (
                  <RankedRow
                    key={row.toolId}
                    title={entry ? toolTitle(plugin, entry.name, entry.def.title, locale) : row.toolId}
                    subtitle={plugin ? pluginName(plugin, locale) : row.pluginId}
                    value={t('app.usage.calls', { count: count(row.calls) })}
                    detail={t('app.usage.success', { rate: formatPercent(row.successRate) })}
                    warn={row.successRate < 0.8}
                    share={row.calls / maxCalls}
                  />
                );
              })}
            </View>
          ) : (
            <Text variant="callout" tone="muted" align="center" className="py-4">
              {t('app.usage.noTools')}
            </Text>
          )}
        </Section>
      </FadeIn>

      {models.length ? (
        <FadeIn index={5}>
          <Section title={t('app.usage.models')}>
            <View className="gap-3.5">
              {models.map((m) => {
                const provider = registry.provider(m.providerId);
                const name = provider?.def.models.find((x) => x.id === m.model)?.name ?? m.model;
                return (
                  <RankedRow
                    key={`${m.providerId}/${m.model}`}
                    title={name}
                    subtitle={provider?.def.name ?? m.providerId}
                    value={formatPercent(m.share)}
                    detail={`${formatCompact(m.tokens)} tokens`}
                    share={m.share}
                  />
                );
              })}
            </View>
          </Section>
        </FadeIn>
      ) : null}
    </>
  );
}
