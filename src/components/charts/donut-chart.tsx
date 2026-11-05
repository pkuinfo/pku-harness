import { useEffect } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { useT } from '@/i18n';
import { curves, useTheme } from '@/theme';

import { Text } from '../text';
import { donutArcs, segmentAt, type Arc } from './donut-geometry';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Segment({ arc, r, c, color, stroke, dim, progress, circumference }: { arc: Arc; r: number; c: number; color: string; stroke: number; dim: boolean; progress: SharedValue<number>; circumference: number }) {
  // Segments draw one after another as the sweep passes them.
  const props = useAnimatedProps(() => {
    const local = Math.min(1, Math.max(0, (progress.get() - arc.start) / arc.frac));
    return { strokeDashoffset: arc.dash * (1 - local) };
  });
  return (
    <G rotation={arc.start * 360} origin={`${c}, ${c}`}>
      <AnimatedCircle
        cx={c}
        cy={c}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${arc.dash} ${circumference}`}
        opacity={dim ? 0.3 : 1}
        animatedProps={props}
      />
    </G>
  );
}

/**
 * Share of a whole as a ring (category spending). Segments sweep in clockwise once on mount (a
 * fade under reduced motion); tap one to select it and the others dim. The centre shows
 * `centerLabel` / `centerCaption` (callers swap them for the selected segment).
 */
export function DonutChart({
  values,
  colors,
  size = 168,
  thickness,
  selected = null,
  onSelect,
  centerLabel,
  centerCaption,
  accessibilityLabel,
}: {
  values: number[];
  colors: readonly string[];
  size?: number;
  thickness?: number;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  centerLabel?: string;
  centerCaption?: string;
  accessibilityLabel: string;
}) {
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const stroke = thickness ?? Math.max(10, Math.round(size * 0.12));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const arcs = donutArcs(values, circumference);
  const key = values.join(',');

  const progress = useSharedValue(reduced ? 1 : 0);
  const fade = useSharedValue(reduced ? 0 : 1);
  useEffect(() => {
    if (reduced) {
      progress.set(1);
      fade.set(withTiming(1, { duration: 200 }));
    } else {
      progress.set(0);
      progress.set(withTiming(1, { duration: 760, easing: Easing.bezier(...curves.out) }));
    }
  }, [key, reduced, progress, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));

  const onPress = (e: GestureResponderEvent) => {
    if (!onSelect) return;
    const i = segmentAt(arcs, e.nativeEvent.locationX, e.nativeEvent.locationY, size, stroke);
    onSelect(i === null || i === selected ? null : i);
  };

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size, height: size }}>
      <Pressable onPress={onPress} disabled={!onSelect} accessibilityHint={onSelect ? t('app.ui.tapSegments') : undefined} style={{ width: size, height: size }}>
        <Animated.View pointerEvents="none" style={fadeStyle}>
          <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surface2} strokeWidth={stroke} fill="none" />
            {arcs.map((arc, i) =>
              arc ? (
                <Segment
                  key={`${key}-${i}`}
                  arc={arc}
                  r={r}
                  c={size / 2}
                  color={colors[i % colors.length]}
                  stroke={stroke}
                  dim={selected !== null && selected !== i}
                  progress={progress}
                  circumference={circumference}
                />
              ) : null,
            )}
          </Svg>
        </Animated.View>
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center" style={{ padding: stroke + 6 }}>
          {centerLabel ? (
            <Text variant={size >= 140 ? 'numberM' : 'bodyStrong'} numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'] }}>
              {centerLabel}
            </Text>
          ) : null}
          {centerCaption ? (
            <Text variant="micro" tone="faint" numberOfLines={1} align="center">
              {centerCaption}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
