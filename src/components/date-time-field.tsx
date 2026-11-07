import { DatePickerDialog, TimePickerDialog } from '@expo/ui/jetpack-compose';
import { DatePicker } from '@expo/ui/swift-ui';
import { labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';
import { at as clockAt, parts as clockParts } from '@pku-harness/sdk';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useLocale, useT } from '@/i18n';
import { useTheme, type ThemeColors } from '@/theme';
import { cx } from '@/utils/cx';
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
export const formatClock = (d: Date) => {
  const p = clockParts(d.getTime());
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

/**
 * The native pickers work in the device's own zone, but we want the user to pick in the app's
 * clock zone (Settings). These two bridge the gap: `toDisplay` makes a device-local `Date` that
 * *reads* as the instant's app-zone wall-clock (so a picker seeded with it shows the right
 * numbers), and `fromDisplay` reinterprets the device-local wall-clock the picker hands back as
 * app-zone wall-clock and returns the real instant. When the app zone is the device zone (the
 * default) the delta is zero and both are identities.
 */
const toDisplay = (d: Date) => {
  const p = clockParts(d.getTime());
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
};
const fromDisplay = (d: Date) => new Date(clockAt(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()));

/**
 * Date and/or time input. Android: the native Material 3 dialogs (the date dialog reports UTC
 * midnight of the chosen day; the time dialog reports local time). iOS: the SwiftUI compact
 * DatePicker inside the field (tap the chip → the system calendar / wheel popover), local time.
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
  // A device-local Date that reads as base's app-zone wall-clock, to seed the native pickers.
  const disp = toDisplay(base);

  const pickedDate = (utcMidnight: Date) => {
    // The date dialog reports UTC midnight of the chosen day; those UTC fields are the app-zone
    // day. Keep base's app-zone time of day.
    const bp = clockParts(base.getTime());
    const next = new Date(clockAt(utcMidnight.getUTCFullYear(), utcMidnight.getUTCMonth() + 1, utcMidnight.getUTCDate(), bp.hour, bp.minute));
    if (mode === 'datetime') {
      onChange(next);
      setStep('time');
    } else {
      onChange(next);
      setStep('none');
    }
  };
  const pickedTime = (local: Date) => {
    // The time dialog reports the picked H:M as device-local fields; they are the app-zone H:M
    // the user saw. Keep the current app-zone day.
    const vp = clockParts((value ?? base).getTime());
    onChange(new Date(clockAt(vp.year, vp.month, vp.day, local.getHours(), local.getMinutes())));
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
      {Platform.OS === 'ios' ? (
        <View className="min-h-12 flex-row items-center gap-2 rounded-md border border-edge bg-surface-2 px-3" style={CURVE}>
          <Icon name={mode === 'time' ? 'clock' : 'schedule'} size={18} color={c.textMuted} />
          <View className="flex-1 items-start">
            <NativeHost>
              <DatePicker
                selection={disp}
                displayedComponents={mode === 'date' ? ['date'] : mode === 'time' ? ['hourAndMinute'] : ['date', 'hourAndMinute']}
                onDateChange={(d) => onChange(fromDisplay(d))}
                modifiers={[labelsHidden(), tint(c.accent)]}
              />
            </NativeHost>
          </View>
          {value && onClear ? (
            <PressableScale accessibilityRole="button" accessibilityLabel={t('app.ui.clear', { label })} onPress={onClear} className="size-10 items-center justify-center">
              <Icon name="close" size={18} color={c.textFaint} />
            </PressableScale>
          ) : null}
        </View>
      ) : null}
      <View className={cx('flex-row items-center gap-2', Platform.OS === 'ios' && 'hidden')}>
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
            initialDate={new Date(Date.UTC(disp.getFullYear(), disp.getMonth(), disp.getDate())).toISOString()}
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
            initialDate={disp.toISOString()}
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

/** Next whole hour, in the app clock zone. */
function defaultValue() {
  const p = clockParts(Date.now());
  // clockAt rolls hour 24 over to next midnight, so `hour + 1` is safe at 23:xx.
  return new Date(clockAt(p.year, p.month, p.day, p.hour + 1, 0, 0));
}
