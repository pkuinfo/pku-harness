import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useState } from 'react';

import { radius, shadows, spacing, springs, useTheme, useThemeName } from '@/theme';
import { haptics } from '@/utils/haptics';

import { PressableScale } from './pressable-scale';
import { Text } from './text';

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
  const c = useTheme();
  const dark = useThemeName() === 'dark';
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
      style={[styles.track, { backgroundColor: c.surface2 }]}>
      {width > 0 ? <Animated.View
          style={[styles.thumb, dark ? { backgroundColor: c.surface3 } : { backgroundColor: c.surface, boxShadow: shadows.raised }, thumb]}
        /> : null}
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
          style={styles.item}>
          <Text variant="callout" tone={o.value === value ? 'default' : 'muted'}>
            {o.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.full, padding: 2, minHeight: 40 },
  thumb: { position: 'absolute', top: 2, bottom: 2, borderRadius: radius.full },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
});
