import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Chip } from '@/components/chip';
import { FadeIn as Enter } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { useJobs } from '@/core/scheduler/store';
import { classesOn, weekOf } from '@/core/timetable/model';
import { timetable, useTimetable } from '@/core/timetable/store';
import { useTodos } from '@/core/todo';
import { useNow } from '@/hooks/use-now';
import { radius, spacing, useTheme } from '@/theme';

import { ClassList } from './class-list';
import { ReminderList } from './reminder-list';
import { TodoList } from './todo-list';
import { WeekGrid } from './week-grid';
import { sameDay, WeekNav, WeekStrip } from './week-strip';

const LEADS: { label: string; value: string }[] = [
  { label: '关', value: 'off' },
  { label: '5 分', value: '5' },
  { label: '10 分', value: '10' },
  { label: '15 分', value: '15' },
  { label: '30 分', value: '30' },
];

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.sectionHead}>
        <Text variant="micro" tone="faint">
          {title}
        </Text>
        {meta ? (
          <Text variant="micro" tone="faint">
            {meta}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function QuickAction({ icon, label, href }: { icon: IconName; label: string; href: Parameters<typeof router.push>[0] }) {
  const c = useTheme();
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href)} style={[styles.quick, { backgroundColor: c.surface }]}>
      <Icon name={icon} size={16} color={c.accent} />
      <Text variant="callout">{label}</Text>
    </PressableScale>
  );
}

/** Schedule tab: classes, to-dos and reminders for a day, or the week timetable (docs §2, §8). */
export function Schedule() {
  const now = useNow();
  const { courses, semester, reminderMinutes } = useTimetable();
  const todos = useTodos();
  const jobs = useJobs();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [selected, setSelected] = useState(() => new Date());

  const dayClasses = classesOn(courses, selected, semester);
  const week = weekOf(semester, selected);
  const isToday = sameDay(selected, now);
  const reminders = jobs
    .filter((j) => !j.meta?.todoId && !j.meta?.courseId)
    .filter((j) => j.nextRunAt != null || (j.lastRunAt != null && now.getTime() - j.lastRunAt < 86_400_000))
    .sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity));

  const subtitle = `${selected.getMonth() + 1}月${selected.getDate()}日${week && week >= 1 && semester && week <= semester.weeks ? ` · 第 ${week} 周` : ''}`;

  return (
    <Screen title="日程" subtitle={subtitle}>
      <Enter index={0}>
        <View style={{ gap: spacing.md }}>
          <Segmented
            options={[
              { label: '日程', value: 'day' },
              { label: '课表', value: 'week' },
            ]}
            value={view}
            onChange={setView}
          />
          {view === 'day' ? (
            <WeekStrip selected={selected} onSelect={setSelected} hasClasses={(d) => classesOn(courses, d, semester).length > 0} />
          ) : (
            <WeekNav selected={selected} onSelect={setSelected} week={week} />
          )}
        </View>
      </Enter>

      {view === 'day' ? (
        <>
          <Enter index={1}>
            <View style={styles.quickRow}>
              <QuickAction icon="todo" label="待办" href={{ pathname: '/todo/[id]', params: { id: 'new' } }} />
              <QuickAction icon="bell" label="提醒" href={{ pathname: '/reminder/[id]', params: { id: 'new' } }} />
              <QuickAction icon="book" label="课程" href={{ pathname: '/course/[id]', params: { id: 'new' } }} />
            </View>
          </Enter>
          <Enter index={2}>
            <Section title={isToday ? '今天的课' : '课程'} meta={dayClasses.length ? `${dayClasses.length} 节` : undefined}>
              <ClassList classes={dayClasses} isToday={isToday} now={now} />
            </Section>
          </Enter>
          <Enter index={3}>
            <Section title="待办" meta={todos.filter((t) => !t.doneAt).length ? `${todos.filter((t) => !t.doneAt).length} 项` : undefined}>
              <TodoList todos={todos} now={now} />
            </Section>
          </Enter>
          <Enter index={4}>
            <Section title="提醒与定时任务" meta={reminders.length ? `${reminders.length} 个` : undefined}>
              {reminders.length ? (
                <ReminderList jobs={reminders} />
              ) : (
                <Text variant="callout" tone="muted">
                  还没有提醒。可以点上面的「提醒」，或在对话里说「每 3 天提醒我交水费，共 16 次」。
                </Text>
              )}
            </Section>
          </Enter>
        </>
      ) : (
        <Animated.View entering={FadeIn} style={{ gap: spacing.xl }}>
          {courses.length ? (
            <WeekGrid courses={courses} semester={semester} selected={selected} now={now} />
          ) : (
            <Text variant="callout" tone="muted">
              课表是空的。登录校园账号后会自动同步；也可以手动添加，或在对话里把课表发给 AI。
            </Text>
          )}
          <ListGroup title="课表设置">
            <ListRow
              icon="schedule"
              title="学期"
              subtitle={semester ? `${semester.name} · ${semester.start} 起 · ${semester.weeks} 周` : '未设置，教学周和单双周无法计算'}
              onPress={() => router.push('/semester')}
            />
            <ListRow icon="plus" iconTint={undefined} title="添加课程" onPress={() => router.push({ pathname: '/course/[id]', params: { id: 'new' } })} />
          </ListGroup>
          <View style={{ gap: spacing.sm }}>
            <View style={styles.sectionHead}>
              <Text variant="micro" tone="faint">
                上课提醒（提前）
              </Text>
              {reminderMinutes != null ? <Chip label={`已为 ${courses.length} 门课设置`} tone="up" /> : null}
            </View>
            <Segmented
              options={LEADS}
              value={reminderMinutes == null ? 'off' : String(reminderMinutes)}
              onChange={(v) => timetable.setReminderMinutes(v === 'off' ? null : Number(v))}
            />
          </View>
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
});
