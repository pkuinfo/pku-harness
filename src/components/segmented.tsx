import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { springs } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { PressableScale } from './pressable-scale';
import { Text } from './text';

const CURVE = { borderCurve: 'continuous' } as const;

/** Segmented control with a sliding thumb (theme picker, schedule views). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const seg = width / options.length;
  const thumb = useAnimatedStyle(() => ({
    width: seg - 4,
    transform: [{ translateX: withSpring(index * seg + 2, springs.smooth) }],
  }));
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className="min-h-10 flex-row rounded-md border-[0.5px] border-edge bg-surface-2 p-0.5"
      style={CURVE}>
      {/* Thumb: glass lit from the top on dark, a raised card on light. */}
      {width > 0 ? (
        <Animated.View
          className={cx('absolute top-0.5 bottom-0.5 rounded-[8px]', 'dark:bg-surface-3 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]', 'light:bg-elevated light:shadow-[0_1px_3px_rgba(11,13,16,0.12)]')}
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
