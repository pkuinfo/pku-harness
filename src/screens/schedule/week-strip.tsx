import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { radius, spacing, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

const LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
export const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Monday-first week of the selected day; dots mark days with classes. */
export function WeekStrip({
  selected,
  onSelect,
  hasClasses,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  hasClasses: (d: Date) => boolean;
}) {
  const c = useTheme();
  const monday = mondayOf(selected);
  const today = new Date();
  return (
    <View style={styles.wrap}>
      <IconButton icon="back" label="上一周" variant="ghost" size={32} onPress={() => onSelect(addDays(selected, -7))} />
      <View style={styles.days}>
        {LABELS.map((label, i) => {
          const day = addDays(monday, i);
          const isSel = sameDay(day, selected);
          const isToday = sameDay(day, today);
          return (
            <PressableScale
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`周${label} ${day.getMonth() + 1}月${day.getDate()}日`}
              haptic={false}
              onPress={() => {
                haptics.select();
                onSelect(day);
              }}
              style={[styles.day, isSel && { backgroundColor: c.accent }]}>
              <Text variant="micro" tone={isSel ? 'onAccent' : 'faint'}>
                {label}
              </Text>
              <Text variant="bodyStrong" tone={isSel ? 'onAccent' : isToday ? 'accent' : 'default'}>
                {day.getDate()}
              </Text>
              <View style={[styles.dot, { backgroundColor: hasClasses(day) ? (isSel ? c.onAccent : c.textFaint) : 'transparent' }]} />
            </PressableScale>
          );
        })}
      </View>
      <IconButton icon="chevronRight" label="下一周" variant="ghost" size={32} onPress={() => onSelect(addDays(selected, 7))} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  days: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
    width: 40,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  nav: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  dot: { width: 4, height: 4, borderRadius: radius.full },
});

/** Compact week navigator for the timetable view (the grid header already shows the days). */
export function WeekNav({ selected, onSelect, week }: { selected: Date; onSelect: (d: Date) => void; week: number | null }) {
  const monday = mondayOf(selected);
  const sunday = addDays(monday, 6);
  const label = `${monday.getMonth() + 1}月${monday.getDate()}日 – ${sunday.getMonth() + 1}月${sunday.getDate()}日`;
  return (
    <View style={styles.wrap}>
      <IconButton icon="back" label="上一周" variant="ghost" size={32} onPress={() => onSelect(addDays(selected, -7))} />
      <PressableScale accessibilityRole="button" accessibilityLabel="回到本周" style={styles.nav} onPress={() => onSelect(new Date())}>
        <Text variant="bodyStrong">{week != null && week >= 1 ? `第 ${week} 周` : '本周'}</Text>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      </PressableScale>
      <IconButton icon="chevronRight" label="下一周" variant="ghost" size={32} onPress={() => onSelect(addDays(selected, 7))} />
    </View>
  );
}
