import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { curves, useTheme } from '@/theme';

import { Text } from './text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Circular progress (0–1) that sweeps to its value, with a centred label. */
export function ProgressRing({ value, label, caption, tone = 'accent', size = 88 }: { value: number; label?: string; caption?: string; tone?: 'accent' | 'up' | 'down' | 'warn'; size?: number }) {
  const c = useTheme();
  const color = tone === 'up' ? c.up : tone === 'down' ? c.down : tone === 'warn' ? c.warn : c.accent;
  const stroke = Math.max(6, size * 0.09);
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(Math.max(0, Math.min(1, value)), { duration: 900, easing: Easing.bezier(...curves.out) }));
  }, [value, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.get()) }));
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`${label ?? ''} ${Math.round(value * 100)}%`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surface3} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} animatedProps={props} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {label ? <Text variant="numberM">{label}</Text> : null}
        {caption ? (
          <Text variant="micro" tone="faint">
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
