import { View } from 'react-native';

import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { PressableScale } from './pressable-scale';
import { Text } from './text';

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const LABEL = ['日', '一', '二', '三', '四', '五', '六'];

/** Monday-first weekday chips. `multiple` for weekly repeats, single for a course. */
export function WeekdayPicker({ value, onChange, multiple }: { value: number[]; onChange: (v: number[]) => void; multiple?: boolean }) {
  return (
    <View className="flex-row justify-between" accessibilityRole={multiple ? undefined : 'radiogroup'}>
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
            className={cx('h-10 w-10 items-center justify-center rounded-md', on ? 'bg-brand' : 'border-[0.5px] border-edge bg-surface-2')}
            style={{ borderCurve: 'continuous' }}>
            <Text variant="callout" tone={on ? 'onAccent' : 'muted'}>
              {LABEL[d]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
