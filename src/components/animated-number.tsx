import { useEffect, useRef } from 'react';
import { View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { springs, typography, useTheme, type TypographyVariant } from '@/theme';

import { Text } from './text';

const DIGITS = '0123456789';

/**
 * Rolling-digit number. Each digit is a vertical strip of 0–9 that springs to its value.
 * Non-digit characters (¥ , . -) render statically.
 */
export function AnimatedNumber({
  value,
  format = (n) => n.toFixed(2),
  variant = 'numberL',
  color,
  style,
}: {
  value: number;
  format?: (n: number) => string;
  variant?: TypographyVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const text = format(value);
  const lineHeight = (typography[variant] as TextStyle).lineHeight ?? 24;
  return (
    <View className="flex-row items-start" accessible accessibilityLabel={text}>
      {text.split('').map((ch, i) => {
        const key = `${text.length - i}`; // keyed from the right so digits keep identity
        return DIGITS.includes(ch) ? (
          <Digit key={key} digit={Number(ch)} lineHeight={lineHeight} variant={variant} color={color} style={style} />
        ) : (
          <Text key={key} variant={variant} style={[color ? { color } : null, style]}>
            {ch}
          </Text>
        );
      })}
    </View>
  );
}

function Digit({
  digit,
  lineHeight,
  variant,
  color,
  style,
}: {
  digit: number;
  lineHeight: number;
  variant: TypographyVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const first = useRef(true);
  const y = useSharedValue(-digit * lineHeight);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    y.value = reduced ? -digit * lineHeight : withSpring(-digit * lineHeight, springs.smooth);
  }, [digit, lineHeight, reduced, y]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View className="overflow-hidden" style={{ height: lineHeight }}>
      <Animated.View style={animated}>
        {DIGITS.split('').map((d) => (
          <Animated.Text
            key={d}
            style={[typography[variant], { color: color ?? c.text, height: lineHeight }, style]}>
            {d}
          </Animated.Text>
        ))}
      </Animated.View>
    </View>
  );
}
