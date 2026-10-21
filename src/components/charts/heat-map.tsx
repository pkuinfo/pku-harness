import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import type { HeatCell, Heatmap } from '@/core/usage/aggregate';
import { formatCompact, formatDay, formatInt } from '@/core/usage/format';
import { shadows, useTheme } from '@/theme';

import { Text } from '../text';
import { useHeatRamp } from './palette';

const CELL = 13;
const GAP = 3;
const STEP = CELL + GAP;
const LABEL_W = 18;
const MONTH_H = 16;
const WEEKDAY_LABELS: [number, string][] = [
  [0, '一'],
  [2, '三'],
  [4, '五'],
];

type Pick = { col: number; row: number; cell: HeatCell };

/**
 * GitHub-style activity grid: columns are weeks (oldest left), rows Monday → Sunday. Opens
 * scrolled to today. Tap a day → a tooltip above it; the cell gets a ring.
 */
export function HeatMap({ heat }: { heat: Heatmap }) {
  const c = useTheme();
  const ramp = useHeatRamp();
  const reduced = useReducedMotion();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Where the user scrolled to; null = still at the end (today), where it opens.
  const [userOffset, setOffset] = useState<number | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [viewport, setViewport] = useState(0);
  const [frame, setFrame] = useState({ width: 0, tip: 0 });

  const cols = heat.weeks.length;
  const gridW = cols * STEP - GAP;
  const gridH = 7 * STEP - GAP;
  const offset = userOffset ?? Math.max(0, gridW - viewport);

  const onPress = (e: GestureResponderEvent) => {
    const col = Math.floor(e.nativeEvent.locationX / STEP);
    const row = Math.floor(e.nativeEvent.locationY / STEP);
    const cell = heat.weeks[col]?.[row];
    if (!cell || (pick && pick.col === col && pick.row === row)) setPick(null);
    else setPick({ col, row, cell });
  };

  // Tooltip: centred over the cell (in the outer frame), clamped to the card; below the cell for
  // the top two rows so it never leaves the chart.
  let tip = null;
  if (pick) {
    const centre = LABEL_W + pick.col * STEP + CELL / 2 - offset;
    const left = Math.max(0, Math.min(frame.width - frame.tip, centre - frame.tip / 2));
    const below = pick.row < 2;
    const top = below ? MONTH_H + (pick.row + 1) * STEP + 2 : MONTH_H + pick.row * STEP - 34;
    tip = (
      <Animated.View
        key={`${pick.col}-${pick.row}`}
        entering={reduced ? undefined : FadeIn.duration(140)}
        exiting={reduced ? undefined : FadeOut.duration(100)}
        pointerEvents="none"
        onLayout={(e) => setFrame((f) => (f.tip === e.nativeEvent.layout.width ? f : { ...f, tip: e.nativeEvent.layout.width }))}
        className="absolute rounded-md border-[0.5px] border-edge bg-elevated px-2.5 py-1.5"
        style={{ left, top, borderCurve: 'continuous', boxShadow: shadows.float, opacity: frame.tip ? 1 : 0 }}>
        <Text variant="caption" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
          {`${formatDay(new Date(pick.cell.date))} · ${formatInt(pick.cell.turns)} 轮 · ${formatCompact(pick.cell.tokens)} tokens`}
        </Text>
      </Animated.View>
    );
  }

  return (
    <View
      onLayout={(e) => setFrame((f) => ({ ...f, width: e.nativeEvent.layout.width }))}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`近 ${cols} 周共 ${heat.totalTurns} 轮对话，单日最多 ${heat.maxTurns} 轮`}>
      <View className="flex-row">
        {/* Weekday labels stay put while the weeks scroll. */}
        <View style={{ width: LABEL_W, paddingTop: MONTH_H }}>
          {WEEKDAY_LABELS.map(([row, label]) => (
            <Text key={row} variant="micro" tone="faint" className="absolute" style={{ top: MONTH_H + row * STEP - 1, lineHeight: CELL + 2 }}>
              {label}
            </Text>
          ))}
        </View>
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => {
            scroll.current?.scrollToEnd({ animated: false });
            setOffset(null);
          }}
          onScrollBeginDrag={() => setPick(null)}
          onMomentumScrollEnd={(e) => setOffset(e.nativeEvent.contentOffset.x)}
          onScrollEndDrag={(e) => setOffset(e.nativeEvent.contentOffset.x)}
          onLayout={(e) => setViewport(e.nativeEvent.layout.width)}>
          <View>
            <View style={{ height: MONTH_H, width: gridW }}>
              {heat.months.map((m) => (
                <Text key={m.col} variant="micro" tone="faint" className="absolute" style={{ left: m.col * STEP }}>
                  {m.label}
                </Text>
              ))}
            </View>
            <Pressable onPress={onPress} style={{ width: gridW, height: gridH }}>
              <Svg width={gridW} height={gridH} pointerEvents="none">
                {heat.weeks.map((col, ci) =>
                  col.map((cell, ri) =>
                    cell ? (
                      <Rect key={`${ci}-${ri}`} x={ci * STEP} y={ri * STEP} width={CELL} height={CELL} rx={3} fill={ramp[cell.level]} />
                    ) : null,
                  ),
                )}
                {pick ? (
                  <Rect x={pick.col * STEP - 1} y={pick.row * STEP - 1} width={CELL + 2} height={CELL + 2} rx={4} fill="none" stroke={c.text} strokeWidth={1.5} />
                ) : null}
              </Svg>
            </Pressable>
          </View>
        </ScrollView>
      </View>
      <View className="mt-3 flex-row items-center justify-end gap-1">
        <Text variant="micro" tone="faint" className="mr-1">
          少
        </Text>
        {ramp.map((color, i) => (
          <View key={i} className="rounded-[3px]" style={{ width: CELL - 3, height: CELL - 3, backgroundColor: color }} />
        ))}
        <Text variant="micro" tone="faint" className="ml-1">
          多
        </Text>
      </View>
      {tip}
    </View>
  );
}
