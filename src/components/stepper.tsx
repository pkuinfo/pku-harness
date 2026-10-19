import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { IconButton } from './button';
import { Text } from './text';

/** − value + for small integers (intervals, counts). */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 999,
  suffix,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  label: string;
}) {
  const c = useTheme();
  const set = (n: number) => {
    const v = Math.max(min, Math.min(max, n));
    if (v !== value) haptics.select();
    onChange(v);
  };
  return (
    <View style={[styles.wrap, { backgroundColor: c.surface2 }]} accessibilityLabel={`${label}：${value}${suffix ?? ''}`}>
      <IconButton icon="minus" label={`减少${label}`} variant="ghost" size={36} disabled={value <= min} onPress={() => set(value - 1)} />
      <Text variant="bodyStrong" style={styles.value}>
        {value}
        {suffix ? (
          <Text variant="callout" tone="muted">
            {suffix}
          </Text>
        ) : null}
      </Text>
      <IconButton icon="plus" label={`增加${label}`} variant="ghost" size={36} disabled={value >= max} onPress={() => set(value + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderCurve: 'continuous', alignSelf: 'flex-start', paddingHorizontal: spacing.xxs },
  value: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
