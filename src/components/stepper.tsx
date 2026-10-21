import { View } from 'react-native';

import { useT } from '@/i18n';
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
  const t = useT();
  const set = (n: number) => {
    const v = Math.max(min, Math.min(max, n));
    if (v !== value) haptics.select();
    onChange(v);
  };
  return (
    <View className="flex-row items-center self-start rounded-md border-[0.5px] border-edge bg-surface-2 px-0.5" style={{ borderCurve: 'continuous' }} accessibilityLabel={t('app.ui.fieldValue', { label, value: `${value}${suffix ?? ''}` })}>
      <IconButton icon="minus" label={t('app.ui.decrease', { label })} variant="ghost" size={36} disabled={value <= min} onPress={() => set(value - 1)} />
      <Text variant="bodyStrong" className="min-w-14 text-center" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
        {suffix ? (
          <Text variant="callout" tone="muted">
            {suffix}
          </Text>
        ) : null}
      </Text>
      <IconButton icon="plus" label={t('app.ui.increase', { label })} variant="ghost" size={36} disabled={value >= max} onPress={() => set(value + 1)} />
    </View>
  );
}
