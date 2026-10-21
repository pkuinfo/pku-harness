import { useEffect, useState } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';

import { springs, useTheme } from '@/theme';

import { Text } from '../text';

/** Column with a 4px rounded data end, square at the baseline. */
function columnPath(x: number, y: number, w: number, h: number, rounded: boolean) {
  if (h <= 0) return '';
  const r = rounded ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y + h}Z`;
}

const GAP = 2;

/**
 * Thin (stacked) columns over one baseline. `series[s][i]` is series s at column i, stacked
 * bottom → top in series order with a 2px gap. Grows from the baseline once on mount (UI thread;
 * a fade under reduced motion). Tap a column to select it; others dim.
 */
export function ColumnChart({
  series,
  colors,
  height = 112,
  maxBar = 24,
  xLabels,
  selected,
  onSelect,
  accessibilityLabel,
}: {
  series: number[][];
  colors: readonly string[];
  height?: number;
  maxBar?: number;
  xLabels: { index: number; label: string }[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  accessibilityLabel: string;
}) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const count = series[0]?.length ?? 0;
  const totals = Array.from({ length: count }, (_, i) => series.reduce((sum, s) => sum + (s[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const slot = count ? width / count : 0;
  const bar = Math.max(2, Math.min(maxBar, slot * 0.62));

  const grow = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (width > 0) grow.set(reduced ? withTiming(1, { duration: 200 }) : withSpring(1, springs.smooth));
  }, [width, reduced, grow]);
  const growStyle = useAnimatedStyle(() => (reduced ? { opacity: grow.get() } : { transform: [{ scaleY: grow.get() }] }));

  const onPress = (e: GestureResponderEvent) => {
    if (!slot) return;
    const i = Math.min(count - 1, Math.max(0, Math.floor(e.nativeEvent.locationX / slot)));
    onSelect(selected === i ? null : i);
  };

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Pressable onPress={onPress} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessibilityHint="点按柱子查看数值">
        {width > 0 ? (
          <Animated.View pointerEvents="none" style={[{ width, height, transformOrigin: 'bottom' }, growStyle]}>
            <Svg width={width} height={height}>
              {totals.map((total, i) => {
                if (total <= 0) return null;
                const x = i * slot + (slot - bar) / 2;
                let top = height;
                const dim = selected !== null && selected !== i;
                const segs = series.map((s) => s[i] ?? 0);
                const last = segs.reduce((acc, v, si) => (v > 0 ? si : acc), -1);
                return segs.map((v, si) => {
                  if (v <= 0) return null;
                  // Every segment keeps ≥ 1px so a sliver stays visible; gaps only between segments.
                  const h = Math.max(1, (v / max) * (height - 1));
                  const y = top - h;
                  const gap = si < last ? GAP : 0;
                  top = y;
                  return <Path key={`${i}-${si}`} d={columnPath(x, y + gap, bar, h - gap, si === last)} fill={colors[si]} opacity={dim ? 0.35 : 1} />;
                });
              })}
              <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={c.border} strokeWidth={1} />
            </Svg>
          </Animated.View>
        ) : null}
      </Pressable>
      <View className="h-4 mt-1">
        {width > 0
          ? xLabels.map(({ index, label }) => (
              <Text
                key={index}
                variant="micro"
                tone="faint"
                numberOfLines={1}
                className="absolute w-12"
                align="center"
                style={{ left: Math.min(width - 48, Math.max(0, index * slot + slot / 2 - 24)) }}>
                {label}
              </Text>
            ))
          : null}
      </View>
    </View>
  );
}
