import { useState } from 'react';
import { View } from 'react-native';

import { ColumnChart } from '@/components/charts/column-chart';
import { DonutChart } from '@/components/charts/donut-chart';
import { Legend } from '@/components/charts/legend';
import { LineChart } from '@/components/charts/line-chart';
import { useCategorical, useToneColor } from '@/components/charts/palette';
import { Text } from '@/components/text';
import { useT } from '@/i18n';

import { axisLabels, formatChartValue, type ChartDatum, type ChartFormat } from './host-charts-format';

/**
 * Charts for plugins (`HostComponents.ColumnChart / DonutChart / LineChart / Legend`): the app's
 * chart primitives behind small, serialisable props ({ label, value }[] + tone), so plugin
 * charts match the usage board. Colours come only from theme tokens: a tone for single-series
 * charts, the categorical palette (`HostTheme.courseColor(i).ink`) for segments and legends.
 */

type Tone = 'accent' | 'up' | 'down' | 'info' | 'warn';
type Labels = 'auto' | 'all' | 'none';
type Selection = { selected?: number | null; onSelect?: (index: number | null) => void };

const clean = (data: ChartDatum[] | undefined) => (Array.isArray(data) ? data : []).map((d) => ({ label: String(d?.label ?? ''), value: Number.isFinite(d?.value) ? Number(d.value) : 0 }));

/** Controlled when `selected` is given, otherwise local state. */
function useSelection({ selected, onSelect }: Selection) {
  const [own, setOwn] = useState<number | null>(null);
  const value = selected !== undefined ? selected : own;
  return [value, (i: number | null) => (onSelect ? onSelect(i) : setOwn(i))] as const;
}

/** Selected point: label left, value right; keeps its height so the chart never jumps. */
function Readout({ datum, format }: { datum: ChartDatum | undefined; format: ChartFormat }) {
  return (
    <View className="h-5 flex-row items-center justify-between gap-2">
      {datum ? (
        <>
          <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
            {datum.label}
          </Text>
          <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
            {formatChartValue(datum.value, format)}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const a11y = (data: ChartDatum[], format: ChartFormat, sep: string) => data.map((d) => `${d.label} ${formatChartValue(d.value, format)}`).join(sep);

export function HostColumnChart(props: { data: ChartDatum[]; tone?: Tone; height?: number; labels?: Labels; readout?: boolean; accessibilityLabel?: string } & ChartFormat & Selection) {
  const t = useT();
  const color = useToneColor(props.tone);
  const data = clean(props.data);
  const [selected, select] = useSelection(props);
  return (
    <View className="gap-1">
      {props.readout !== false ? <Readout datum={selected != null ? data[selected] : undefined} format={props} /> : null}
      <ColumnChart
        series={[data.map((d) => Math.max(0, d.value))]}
        colors={[color]}
        height={props.height ?? 112}
        xLabels={axisLabels(data.map((d) => d.label), props.labels)}
        selected={selected}
        onSelect={select}
        accessibilityLabel={props.accessibilityLabel ?? a11y(data, props, t('app.ui.a11ySep'))}
      />
    </View>
  );
}

export function HostLineChart(props: { data: ChartDatum[]; tone?: Tone; height?: number; area?: boolean; labels?: Labels; readout?: boolean; accessibilityLabel?: string } & ChartFormat & Selection) {
  const t = useT();
  const color = useToneColor(props.tone);
  const data = clean(props.data);
  const [selected, select] = useSelection(props);
  return (
    <View className="gap-1">
      {props.readout !== false ? <Readout datum={selected != null ? data[selected] : undefined} format={props} /> : null}
      <LineChart
        values={data.map((d) => d.value)}
        color={color}
        height={props.height ?? 120}
        area={props.area !== false}
        xLabels={axisLabels(data.map((d) => d.label), props.labels)}
        selected={selected}
        onSelect={select}
        accessibilityLabel={props.accessibilityLabel ?? a11y(data, props, t('app.ui.a11ySep'))}
      />
    </View>
  );
}

export function HostDonutChart(props: { data: ChartDatum[]; size?: number; thickness?: number; centerLabel?: string; centerCaption?: string; selectable?: boolean; accessibilityLabel?: string } & ChartFormat & Selection) {
  const t = useT();
  const colors = useCategorical();
  const data = clean(props.data);
  const [selected, select] = useSelection(props);
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const pick = selected != null ? data[selected] : undefined;
  const share = pick && total > 0 ? Math.round((Math.max(0, pick.value) / total) * 100) : null;
  return (
    <DonutChart
      values={data.map((d) => d.value)}
      colors={colors}
      size={props.size}
      thickness={props.thickness}
      selected={selected}
      onSelect={props.selectable === false ? undefined : select}
      centerLabel={pick ? formatChartValue(pick.value, props) : props.centerLabel}
      centerCaption={pick ? `${pick.label}${share != null ? ` · ${share}%` : ''}` : props.centerCaption}
      accessibilityLabel={props.accessibilityLabel ?? a11y(data, props, t('app.ui.a11ySep'))}
    />
  );
}

export function HostLegend({ items, columns }: { items: { label: string; value?: string; color?: string }[]; columns?: boolean }) {
  const colors = useCategorical();
  return <Legend columns={columns} items={(items ?? []).map((it, i) => ({ label: String(it.label), value: it.value, color: it.color ?? colors[i % colors.length] }))} />;
}
