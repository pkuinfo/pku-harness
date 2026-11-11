import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { PressableScale } from './pressable-scale';
import { Text } from './text';
import { timings } from '@/theme/transitions';

const CURVE = { borderCurve: 'continuous' } as const;

/** Segmented control with a sliding thumb (theme picker, schedule views). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant = 'segmented',
}: {
  variant?: 'segmented' | 'tabs';
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const seg = width / options.length;
  const thumb = useAnimatedStyle(() => ({
    width: seg - 4,
    transform: [{ translateX: withTiming(index * seg + 2, timings.base) }],
  }));
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className={cx('min-h-10 flex-row', variant === 'tabs' ? 'border-b border-edge' : 'rounded-md border-[0.5px] border-edge bg-surface-2 p-0.5')}
      style={CURVE}>
      {/* Selection uses a neutral fill, or an underline for the tabs variant. */}
      {width > 0 ? (
        <Animated.View
          className={variant === 'tabs' ? 'absolute bottom-0 h-0.5 bg-fg' : cx('absolute top-0.5 bottom-0.5 rounded-[8px]', 'dark:bg-surface-3', 'light:bg-elevated')}
          style={[CURVE, thumb]}
        />
      ) : null}
      {options.map((o) => (
        <PressableScale
          key={o.value}
          haptic={false}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.value === value }}
          accessibilityLabel={o.label}
          onPress={() => {
            if (o.value !== value) haptics.select();
            onChange(o.value);
          }}
          className="flex-1 items-center justify-center py-2">
          <Text variant="callout" tone={o.value === value ? 'default' : 'muted'}>
            {o.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}
