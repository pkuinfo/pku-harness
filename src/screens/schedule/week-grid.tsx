import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { classesOn, type Course, type Semester } from '@/core/timetable/model';
import { useLayout } from '@/hooks/use-layout';
import { radius, spacing, useCourseColor, useTheme } from '@/theme';

import { addDays, mondayOf, sameDay } from './week-strip';

const HOUR = 52;
const GUTTER = 34;
const LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const mins = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

function Block({ course, top, height }: { course: Course; top: number; height: number }) {
  const color = useCourseColor(course.color);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${course.name} ${course.start}-${course.end}`}
      onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.id } })}
      scaleTo={0.96}
      style={[styles.block, { top, height, backgroundColor: color.fill, borderLeftColor: color.ink }]}>
      <Text variant="micro" style={{ color: color.ink }} numberOfLines={height > 70 ? 3 : 2}>
        {course.name}
      </Text>
      {course.location && height > 56 ? (
        <Text variant="micro" tone="muted" numberOfLines={2}>
          {course.location}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/** Week timetable: day columns × hours, course blocks, a "now" line on today. */
export function WeekGrid({ courses, semester, selected, now }: { courses: Course[]; semester: Semester | null; selected: Date; now: Date }) {
  const c = useTheme();
  const { contentWidth } = useLayout();
  const monday = mondayOf(selected);
  const days = LABELS.map((_, i) => addDays(monday, i));
  const perDay = days.map((d) => classesOn(courses, d, semester));
  const weekend = perDay[5].length + perDay[6].length > 0;
  const shown = weekend ? 7 : 5;

  const all = perDay.flat();
  const startHour = Math.min(8, ...all.map((x) => Math.floor(mins(x.start) / 60)));
  const endHour = Math.max(21, ...all.map((x) => Math.ceil(mins(x.end) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const colWidth = (contentWidth - spacing.lg * 2 - GUTTER) / shown;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIndex = days.findIndex((d) => sameDay(d, now));

  return (
    <View>
      <View style={[styles.headRow, { paddingLeft: GUTTER }]}>
        {days.slice(0, shown).map((d, i) => {
          const isToday = i === todayIndex;
          return (
            <View key={i} style={[styles.head, { width: colWidth }]}>
              <Text variant="micro" tone={isToday ? 'accent' : 'faint'}>
                周{LABELS[i]}
              </Text>
              <Text variant="callout" tone={isToday ? 'accent' : 'default'}>
                {d.getDate()}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={{ height: hours.length * HOUR, flexDirection: 'row' }}>
        <View style={{ width: GUTTER }}>
          {hours.map((h) => (
            <Text key={h} variant="micro" tone="faint" style={[styles.hour, { top: (h - startHour) * HOUR }]}>
              {h}
            </Text>
          ))}
        </View>
        {days.slice(0, shown).map((d, i) => (
          <View
            key={i}
            style={[
              { width: colWidth, height: hours.length * HOUR, borderLeftColor: c.border, borderLeftWidth: StyleSheet.hairlineWidth },
              i === todayIndex && { backgroundColor: c.surface },
            ]}>
            {hours.map((h) => (
              <View key={h} style={[styles.line, { top: (h - startHour) * HOUR, backgroundColor: c.border }]} />
            ))}
            {perDay[i].map((x) => (
              <Block
                key={x.id}
                course={x}
                top={((mins(x.start) - startHour * 60) / 60) * HOUR}
                height={Math.max(28, ((mins(x.end) - mins(x.start)) / 60) * HOUR - 2)}
              />
            ))}
            {i === todayIndex && nowMin >= startHour * 60 && nowMin <= endHour * 60 ? (
              <View style={[styles.now, { top: ((nowMin - startHour * 60) / 60) * HOUR, backgroundColor: c.accent }]} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', paddingBottom: spacing.sm },
  head: { alignItems: 'center', gap: spacing.xxs },
  hour: { position: 'absolute', left: 0, marginTop: -7, fontVariant: ['tabular-nums'] },
  line: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  block: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderLeftWidth: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    gap: spacing.xxs,
    overflow: 'hidden',
  },
  now: { position: 'absolute', left: 0, right: 0, height: 2 },
});
