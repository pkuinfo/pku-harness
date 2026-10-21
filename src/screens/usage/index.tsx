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
import { registry } from '@/core/runtime/registry';
import type { ToolRange, UsageReport } from '@/core/usage/aggregate';
import { formatCompact, formatInt, formatPercent, formatShortDay } from '@/core/usage/format';
import { useToolRanking, useUsageReport, type UsageState } from '@/core/usage/hooks';
import { radius, useTheme } from '@/theme';

import { RankedRow } from './ranked-row';
import { Section } from './section';

const RANGES: { label: string; value: ToolRange }[] = [
  { label: '7 天', value: '7d' },
  { label: '30 天', value: '30d' },
  { label: '全部', value: 'all' },
];
const HOUR_LABELS = [0, 6, 12, 18, 23].map((h) => ({ index: h, label: `${h}时` }));
const TOOL_ROWS = 8;

/** Usage screen (docs/AGENT-HARNESS.md §6.4): tokens, activity, tools and models. Tokens only, no money. */
export function UsageScreen() {
  const { state, reload } = useUsageReport();
  return (
    <Screen title="用量" subtitle="Usage" back>
      {state.status === 'loading' ? (
        <Loading />
      ) : state.status === 'error' ? (
        <EmptyState icon="warning" title="读取用量失败" message={state.message} action={<Button title="重试" variant="secondary" size="sm" onPress={reload} />} />
      ) : state.report.empty ? (
        <EmptyState icon="trendUp" title="还没有用量数据" message="和 AI 聊几句后，这里会显示 token 用量、活跃时段和常用工具。" />
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
            <Kpi label="今日用量" value={kpis.todayTokens} format={formatCompact} unit="tokens" />
            <Kpi label="本月用量" value={kpis.monthTokens} format={formatCompact} unit="tokens" />
          </View>
          <View className="flex-row gap-3">
            <Kpi label="缓存命中率 · 30 天" value={kpis.cacheHitRate} format={formatPercent} />
            <Kpi label="本月对话" value={kpis.monthTurns} format={formatInt} unit="轮" />
          </View>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <Section title="活跃度" meta={`近 20 周 · ${formatInt(heat.totalTurns)} 轮`}>
          <HeatMap heat={heat} />
        </Section>
      </FadeIn>

      <FadeIn index={2}>
        <Section
          title="时段 · 近 30 天"
          caption={
            hour !== null
              ? `${hour}:00–${hour + 1}:00 · ${formatInt(hours[hour])} 轮`
              : hourTurns > 0
                ? `最常在 ${peak} 点前后使用`
                : '近 30 天没有对话'
          }>
          <ColumnChart
            series={[hours]}
            colors={[c.accent]}
            height={88}
            maxBar={10}
            xLabels={HOUR_LABELS}
            selected={hour}
            onSelect={setHour}
            accessibilityLabel={`每小时对话轮数，${peak} 点最多，${formatInt(hours[peak] ?? 0)} 轮`}
          />
        </Section>
      </FadeIn>

      <FadeIn index={3}>
        <Section
          title="用量 · 近 14 天"
          meta={formatCompact(sum.cached + sum.uncached + sum.output)}
          caption={d ? `${formatShortDay(new Date(d.date))} · 缓存 ${formatCompact(d.cached)} · 未缓存 ${formatCompact(d.uncached)} · 输出 ${formatCompact(d.output)}` : '点按柱子查看当天'}>
          <ColumnChart
            series={[days.map((x) => x.cached), days.map((x) => x.uncached), days.map((x) => x.output)]}
            colors={TOKEN_SERIES}
            height={120}
            xLabels={[0, 7, 13].map((i) => ({ index: i, label: i === 13 ? '今天' : formatShortDay(new Date(days[i].date)) }))}
            selected={day}
            onSelect={setDay}
            accessibilityLabel={`近 14 天共 ${formatCompact(sum.cached + sum.uncached + sum.output)} tokens：缓存命中输入 ${formatCompact(sum.cached)}，未缓存输入 ${formatCompact(sum.uncached)}，输出 ${formatCompact(sum.output)}`}
          />
          <Legend
            items={[
              { label: '缓存命中输入', color: TOKEN_SERIES[0], value: formatCompact(sum.cached) },
              { label: '未缓存输入', color: TOKEN_SERIES[1], value: formatCompact(sum.uncached) },
              { label: '输出', color: TOKEN_SERIES[2], value: formatCompact(sum.output) },
            ]}
          />
        </Section>
      </FadeIn>

      <FadeIn index={4}>
        <Section title="插件与工具">
          <Segmented options={RANGES} value={range} onChange={setRange} />
          {tools.length ? (
            <View className="gap-3.5">
              {tools.slice(0, TOOL_ROWS).map((t) => {
                const entry = registry.tool(t.toolId);
                return (
                  <RankedRow
                    key={t.toolId}
                    title={entry?.def.title ?? t.toolId}
                    subtitle={registry.get(t.pluginId)?.name ?? t.pluginId}
                    value={`${formatInt(t.calls)} 次`}
                    detail={`成功 ${formatPercent(t.successRate)}`}
                    warn={t.successRate < 0.8}
                    share={t.calls / maxCalls}
                  />
                );
              })}
            </View>
          ) : (
            <Text variant="callout" tone="muted" align="center" className="py-4">
              这段时间没有调用工具
            </Text>
          )}
        </Section>
      </FadeIn>

      {models.length ? (
        <FadeIn index={5}>
          <Section title="模型 · 近 30 天">
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
