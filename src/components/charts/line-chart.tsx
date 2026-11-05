import { useEffect, useState } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useT } from '@/i18n';
import { curves, useTheme } from '@/theme';

import { Text } from '../text';

/** Width (dp) of one x-axis label. */
const AXIS_LABEL_W = 64;
/** Room above the highest point and for the selection dot. */
const PAD = 4;

/** Points of a series in a width × height box; the y range always includes 0. */
export function linePoints(values: number[], width: number, height: number): [number, number][] {
  const n = values.length;
  if (!n || width <= 0) return [];
  const finite = values.map((v) => (Number.isFinite(v) ? v : 0));
  const max = Math.max(0, ...finite);
  const min = Math.min(0, ...finite);
  const span = max - min || 1;
  const inner = height - PAD * 2;
  return finite.map((v, i) => [n === 1 ? width / 2 : (i / (n - 1)) * width, PAD + (1 - (v - min) / span) * inner]);
}

/** Smooth path through the points (monotone-ish cubic, no overshoot below the baseline). */
export function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += `C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/**
 * A trend over time: one line with a soft area beneath, over a baseline. Reveals left → right
 * once on mount (a fade under reduced motion). Tap anywhere to select the nearest point.
 */
export function LineChart({
  values,
  color,
  height = 120,
  area = true,
  xLabels,
  selected,
  onSelect,
  accessibilityLabel,
}: {
  values: number[];
  color: string;
  height?: number;
  area?: boolean;
  xLabels: { index: number; label: string }[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  accessibilityLabel: string;
}) {
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const pts = linePoints(values, width, height);
  const line = smoothPath(pts);
  const fill = pts.length > 1 ? `${line}L${pts[pts.length - 1][0].toFixed(1)},${height}L${pts[0][0].toFixed(1)},${height}Z` : '';
  const step = values.length > 1 ? width / (values.length - 1) : width;

  const reveal = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (width > 0) reveal.set(withTiming(1, { duration: reduced ? 200 : 820, easing: Easing.bezier(...curves.out) }));
  }, [width, reduced, reveal]);
  const revealStyle = useAnimatedStyle(() => (reduced ? { opacity: reveal.get() } : { width: width * reveal.get() }));

  const onPress = (e: GestureResponderEvent) => {
    if (!values.length || width <= 0) return;
    const i = values.length === 1 ? 0 : Math.min(values.length - 1, Math.max(0, Math.round(e.nativeEvent.locationX / step)));
    onSelect(selected === i ? null : i);
  };
  const pick = selected != null ? pts[selected] : undefined;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Pressable onPress={onPress} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessibilityHint={t('app.ui.tapPoints')}>
        {width > 0 ? (
          <Animated.View pointerEvents="none" style={[{ height, overflow: 'hidden' }, revealStyle]}>
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id="line-area" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={0.24} />
                  <Stop offset="1" stopColor={color} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={c.border} strokeWidth={1} />
              {area && fill ? <Path d={fill} fill="url(#line-area)" /> : null}
              <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {pick ? (
                <>
                  <Line x1={pick[0]} x2={pick[0]} y1={0} y2={height} stroke={c.border} strokeWidth={1} />
                  <Circle cx={pick[0]} cy={pick[1]} r={4.5} fill={c.bg} stroke={color} strokeWidth={2} />
                </>
              ) : null}
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
                className="absolute"
                align="center"
                style={{ width: AXIS_LABEL_W, left: Math.min(width - AXIS_LABEL_W, Math.max(0, (values.length > 1 ? index * step : width / 2) - AXIS_LABEL_W / 2)) }}>
                {label}
              </Text>
            ))
          : null}
      </View>
    </View>
  );
}
