import { View } from 'react-native';

import { useLocale } from '@/i18n';
import { cx } from '@/utils/cx';
import { weekdayLong, weekdayNarrow } from '@/utils/date';
import { haptics } from '@/utils/haptics';

import { PressableScale } from './pressable-scale';
import { Text } from './text';

const DAYS = [1, 2, 3, 4, 5, 6, 0];

/** Monday-first weekday chips. `multiple` for weekly repeats, single for a course. */
export function WeekdayPicker({ value, onChange, multiple }: { value: number[]; onChange: (v: number[]) => void; multiple?: boolean }) {
  const locale = useLocale();
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
            accessibilityLabel={weekdayLong(d, locale)}
            onPress={() => {
              haptics.select();
              if (!multiple) return onChange([d]);
              const next = on ? value.filter((x) => x !== d) : [...value, d];
              if (next.length) onChange(next);
            }}
            className={cx('h-10 w-10 items-center justify-center rounded-md', on ? 'bg-brand' : 'border-[0.5px] border-edge bg-surface-2')}
            style={{ borderCurve: 'continuous' }}>
            <Text variant="callout" tone={on ? 'onAccent' : 'muted'}>
              {weekdayNarrow(d, locale)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
