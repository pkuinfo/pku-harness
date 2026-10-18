import { DatePickerDialog, TimePickerDialog } from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, type ThemeColors } from '@/theme';

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

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export const formatDate = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY[d.getDay()]}`;
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
  placeholder = '未设置',
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

  const text = value
    ? mode === 'date'
      ? formatDate(value)
      : mode === 'time'
        ? formatClock(value)
        : `${formatDate(value)} ${formatClock(value)}`
    : placeholder;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="callout" tone="muted">
        {label}
      </Text>
      <View style={styles.row}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${label}：${text}`}
          onPress={() => setStep(mode === 'time' ? 'time' : 'date')}
          scaleTo={0.98}
          style={[styles.field, { backgroundColor: c.surface2, borderColor: c.border }]}>
          <Icon name={mode === 'time' ? 'clock' : 'schedule'} size={18} color={c.textMuted} />
          <Text variant="body" tone={value ? 'default' : 'faint'} style={{ flex: 1 }}>
            {text}
          </Text>
        </PressableScale>
        {value && onClear ? (
          <PressableScale accessibilityRole="button" accessibilityLabel={`清除${label}`} onPress={onClear} style={styles.clear}>
            <Icon name="close" size={18} color={c.textFaint} />
          </PressableScale>
        ) : null}
      </View>
      {Platform.OS === 'android' && step === 'date' ? (
        <NativeHost>
          <DatePickerDialog
            initialDate={new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())).toISOString()}
            confirmButtonLabel="确定"
            dismissButtonLabel="取消"
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
            confirmButtonLabel="确定"
            dismissButtonLabel="取消"
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
