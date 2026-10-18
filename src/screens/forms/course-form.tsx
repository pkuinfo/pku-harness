import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { Field } from '@/components/field';
import { dismiss, SheetScreen } from '@/components/sheet-screen';
import { Text } from '@/components/text';
import { WeekdayPicker } from '@/components/weekday-picker';
import { invokeTool } from '@/core/runtime/invoke';
import { formatTime } from '@/core/scheduler/recurrence';
import { formatWeeks, parseWeeks } from '@/core/timetable/model';
import { timetable } from '@/core/timetable/store';
import { spacing } from '@/theme';
import { haptics } from '@/utils/haptics';

const toDate = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const toTime = (d: Date) => formatTime(d.getHours(), d.getMinutes());

/** Add or edit a course meeting. Saves through the timetable tools, like the agent does. */
export function CourseForm({ id }: { id: string }) {
  const existing = id === 'new' ? undefined : timetable.get().courses.find((c) => c.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [teacher, setTeacher] = useState(existing?.teacher ?? '');
  const [weekday, setWeekday] = useState(existing?.weekday ?? (new Date().getDay() || 1));
  const [start, setStart] = useState(toDate(existing?.start ?? '08:00'));
  const [end, setEnd] = useState(toDate(existing?.end ?? '09:50'));
  const [weeks, setWeeks] = useState(existing?.weeks ? formatWeeks(existing.weeks).replace(/周$/, '') : '');
  const [error, setError] = useState<string | null>(null);

  const weeksError = (() => {
    try {
      parseWeeks(weeks);
      return null;
    } catch {
      return '格式如 1-16、1-15单、2-16双、1,3,5';
    }
  })();

  const save = async () => {
    const input = {
      name: name.trim(),
      weekday,
      start: toTime(start),
      end: toTime(end),
      location: location.trim(),
      teacher: teacher.trim(),
      weeks: weeks.trim() || undefined,
    };
    try {
      if (existing) await invokeTool('timetable.updateCourse', { id: existing.id, ...input, weeks: weeks.trim() }, { actor: 'user' });
      else await invokeTool('timetable.addCourse', input, { actor: 'user' });
      haptics.success();
      dismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      haptics.warning();
    }
  };

  const timeError = toTime(end) <= toTime(start) ? '下课时间要晚于上课时间' : null;

  return (
    <SheetScreen
      title={existing ? '编辑课程' : '添加课程'}
      primary="保存"
      onPrimary={save}
      primaryDisabled={!name.trim() || !!weeksError || !!timeError}
      danger={existing ? '删除' : undefined}
      onDanger={async () => {
        haptics.warning();
        if (existing) await invokeTool('timetable.removeCourse', { id: existing.id }, { actor: 'user' });
        dismiss();
      }}>
      <Field label="课程名称" value={name} onChangeText={setName} placeholder="例如：高等数学（B）" autoFocus={!existing} />
      <View style={{ gap: spacing.sm }}>
        <Text variant="callout" tone="muted">
          星期
        </Text>
        <WeekdayPicker value={[weekday]} onChange={([d]) => setWeekday(d)} />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <DateTimeField label="上课" value={start} onChange={setStart} mode="time" />
        </View>
        <View style={{ flex: 1 }}>
          <DateTimeField label="下课" value={end} onChange={setEnd} mode="time" />
        </View>
      </View>
      {timeError ? (
        <Text variant="caption" tone="warn">
          {timeError}
        </Text>
      ) : null}
      <Field label="地点" value={location} onChangeText={setLocation} placeholder="例如：理教 107" />
      <Field label="教师" value={teacher} onChangeText={setTeacher} placeholder="可选" />
      <Field label="周次" value={weeks} onChangeText={setWeeks} placeholder="留空表示每周" hint={weeksError ?? '例如 1-16、1-15单、2-16双'} />
      {error ? (
        <Text variant="caption" tone="down">
          {error}
        </Text>
      ) : null}
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
});
