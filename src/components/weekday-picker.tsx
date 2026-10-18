import { StyleSheet, View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { PressableScale } from './pressable-scale';
import { Text } from './text';

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const LABEL = ['日', '一', '二', '三', '四', '五', '六'];

/** Monday-first weekday chips. `multiple` for weekly repeats, single for a course. */
export function WeekdayPicker({ value, onChange, multiple }: { value: number[]; onChange: (v: number[]) => void; multiple?: boolean }) {
  const c = useTheme();
  return (
    <View style={styles.row} accessibilityRole={multiple ? undefined : 'radiogroup'}>
      {DAYS.map((d) => {
        const on = value.includes(d);
        return (
          <PressableScale
            key={d}
            haptic={false}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={multiple ? { checked: on } : { selected: on }}
            accessibilityLabel={`周${LABEL[d]}`}
            onPress={() => {
              haptics.select();
              if (!multiple) return onChange([d]);
              const next = on ? value.filter((x) => x !== d) : [...value, d];
              if (next.length) onChange(next);
            }}
            style={[styles.chip, { backgroundColor: on ? c.accent : c.surface2 }]}>
            <Text variant="callout" tone={on ? 'onAccent' : 'muted'}>
              {LABEL[d]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  chip: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
