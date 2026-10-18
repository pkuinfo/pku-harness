import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { classStatus, type Course } from '@/core/timetable/model';
import { radius, spacing, useCourseColor, useTheme } from '@/theme';

function ClassCard({ course, now, isToday, isNext }: { course: Course; now: Date; isToday: boolean; isNext: boolean }) {
  const c = useTheme();
  const color = useCourseColor(course.color);
  const status = isToday ? classStatus(course, now) : null;
  const done = status?.state === 'after';
  const ongoing = status?.state === 'ongoing';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${course.name}，${course.start} 到 ${course.end}${course.location ? `，${course.location}` : ''}`}
      onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.id } })}
      scaleTo={0.98}
      style={[styles.card, { backgroundColor: c.surface, opacity: done ? 0.55 : 1 }, ongoing && { borderColor: color.ink, borderWidth: 1 }]}>
      <View style={styles.time}>
        <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
          {course.start}
        </Text>
        <Text variant="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
          {course.end}
        </Text>
      </View>
      <View style={[styles.bar, { backgroundColor: color.ink }]} />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {course.name}
        </Text>
        {course.location || course.teacher ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {[course.location, course.teacher].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {ongoing ? (
          <View style={[styles.track, { backgroundColor: c.surface3 }]}>
            <View style={[styles.fill, { width: `${Math.round(status!.progress * 100)}%`, backgroundColor: color.ink }]} />
          </View>
        ) : null}
      </View>
      {ongoing ? <Chip label="进行中" tone="up" /> : isNext && status?.state === 'before' ? <Chip label={untilText(status.minutesToStart)} tone="accent" /> : null}
    </PressableScale>
  );
}

function untilText(min: number) {
  if (min < 60) return `${min} 分钟后`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分后` : `${h} 小时后`;
}

/** Classes of one day; today shows live status (ongoing progress, countdown to the next). */
export function ClassList({ classes, isToday, now }: { classes: Course[]; isToday: boolean; now: Date }) {
  if (!classes.length) {
    return (
      <View style={styles.empty}>
        <Text variant="callout" tone="muted">
          这天没有课
        </Text>
        <Button title="添加课程" size="sm" variant="secondary" icon="plus" onPress={() => router.push({ pathname: '/course/[id]', params: { id: 'new' } })} />
      </View>
    );
  }
  const nextId = isToday ? classes.find((x) => classStatus(x, now).state !== 'after')?.id : undefined;
  return (
    <View style={{ gap: spacing.sm }}>
      {classes.map((x) => (
        <ClassCard key={x.id} course={x} now={now} isToday={isToday} isNext={x.id === nextId} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  time: { width: 48, alignItems: 'flex-start' },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: radius.full },
  track: { height: 4, borderRadius: radius.full, overflow: 'hidden', marginTop: spacing.xs },
  fill: { height: 4, borderRadius: radius.full },
  empty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
});
