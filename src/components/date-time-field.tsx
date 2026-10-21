import { DatePickerDialog, TimePickerDialog } from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useLocale, useT } from '@/i18n';
import { useTheme, type ThemeColors } from '@/theme';
import { formatDateWeekday } from '@/utils/date';

import { Icon } from './icon';
import { NativeHost } from './native-host';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

/** Material 3 picker colours from our tokens (readable selected states in both themes). */
export function pickerColors(c: ThemeColors) {
  return {
    containerColor: c.surface,
    titleContentColor: c.textMuted,
    headlineContentColor: c.text,
    weekdayContentColor: c.textMuted,
    subheadContentColor: c.textMuted,
    navigationContentColor: c.text,
    dayContentColor: c.text,
    selectedDayContainerColor: c.accent,
    selectedDayContentColor: c.onAccent,
    todayContentColor: c.accent,
    todayDateBorderColor: c.accent,
    selectedYearContainerColor: c.accent,
    selectedYearContentColor: c.onAccent,
    dividerColor: c.border,
    clockDialColor: c.surface2,
    clockDialContentColor: c.text,
    clockDialSelectedContentColor: c.onAccent,
    selectorColor: c.accent,
    timeSelectorContainerColor: c.surface2,
    timeSelectorContentColor: c.text,
    timeSelectorSelectedContainerColor: c.accentMuted,
    timeSelectorSelectedContentColor: c.accent,
    periodSelectorBorderColor: c.border,
  };
}

const CURVE = { borderCurve: 'continuous' } as const;
const pad = (n: number) => String(n).padStart(2, '0');
export const formatClock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Date and/or time input using the native Material 3 dialogs (Android). The date dialog
 * reports UTC midnight of the chosen day; the time dialog reports local time.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = 'datetime',
  placeholder,
  onClear,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  mode?: 'date' | 'time' | 'datetime';
  placeholder?: string;
  onClear?: () => void;
}) {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const [step, setStep] = useState<'none' | 'date' | 'time'>('none');
  const base = value ?? defaultValue();

  const pickedDate = (utcMidnight: Date) => {
    const next = new Date(utcMidnight.getUTCFullYear(), utcMidnight.getUTCMonth(), utcMidnight.getUTCDate(), base.getHours(), base.getMinutes());
    if (mode === 'datetime') {
      onChange(next);
      setStep('time');
    } else {
      onChange(next);
      setStep('none');
    }
  };
  const pickedTime = (local: Date) => {
    const cur = value ?? base;
    onChange(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), local.getHours(), local.getMinutes()));
    setStep('none');
  };

  const date = value ? formatDateWeekday(value, new Date(), locale) : '';
  const text = value
    ? mode === 'date'
      ? date
      : mode === 'time'
        ? formatClock(value)
        : locale === 'en'
          ? `${date}, ${formatClock(value)}`
          : `${date} ${formatClock(value)}`
    : (placeholder ?? t('app.ui.notSet'));

  return (
    <View className="gap-1">
      <Text variant="callout" tone="muted">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('app.ui.fieldValue', { label, value: text })}
          onPress={() => setStep(mode === 'time' ? 'time' : 'date')}
          scaleTo={0.98}
          className="min-h-12 flex-1 flex-row items-center gap-2 rounded-md border border-edge bg-surface-2 px-3"
          style={CURVE}>
          <Icon name={mode === 'time' ? 'clock' : 'schedule'} size={18} color={c.textMuted} />
          <Text variant="body" tone={value ? 'default' : 'faint'} className="flex-1">
            {text}
          </Text>
        </PressableScale>
        {value && onClear ? (
          <PressableScale accessibilityRole="button" accessibilityLabel={t('app.ui.clear', { label })} onPress={onClear} className="size-10 items-center justify-center">
            <Icon name="close" size={18} color={c.textFaint} />
          </PressableScale>
        ) : null}
      </View>
      {Platform.OS === 'android' && step === 'date' ? (
        <NativeHost>
          <DatePickerDialog
            initialDate={new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())).toISOString()}
            confirmButtonLabel={t('app.ui.ok')}
            dismissButtonLabel={t('core.common.cancel')}
            color={c.accent}
            elementColors={pickerColors(c)}
            onDateSelected={pickedDate}
            onDismissRequest={() => setStep('none')}
          />
        </NativeHost>
      ) : null}
      {Platform.OS === 'android' && step === 'time' ? (
        <NativeHost>
          <TimePickerDialog
            initialDate={base.toISOString()}
            is24Hour
            confirmButtonLabel={t('app.ui.ok')}
            dismissButtonLabel={t('core.common.cancel')}
            color={c.accent}
            elementColors={pickerColors(c)}
            onDateSelected={pickedTime}
            onDismissRequest={() => setStep('none')}
          />
        </NativeHost>
      ) : null}
    </View>
  );
}

/** Next whole hour. */
function defaultValue() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}
