import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Chip } from '@/components/chip';
import { formatClock } from '@/components/date-time-field';
import { Icon } from '@/components/icon';
import { NativeCheckbox } from '@/components/native-checkbox';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { addTodo, setTodoDone, type Todo } from '@/core/todo';
import { fonts, radius, spacing, typography, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { sameDay } from './week-strip';

function dueLabel(t: Todo, now: Date): { text: string; tone: 'down' | 'warn' | 'neutral' } | null {
  if (t.dueAt == null) return null;
  const d = new Date(t.dueAt);
  const overdue = !t.doneAt && t.dueAt < now.getTime();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const day = sameDay(d, now) ? '今天' : sameDay(d, tomorrow) ? '明天' : `${d.getMonth() + 1}月${d.getDate()}日`;
  return { text: `${overdue ? '已逾期 · ' : ''}${day} ${formatClock(d)}`, tone: overdue ? 'down' : sameDay(d, now) ? 'warn' : 'neutral' };
}

function TodoRow({ todo, now }: { todo: Todo; now: Date }) {
  const c = useTheme();
  const due = dueLabel(todo, now);
  const done = !!todo.doneAt;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} layout={LinearTransition} style={styles.row}>
      <NativeCheckbox
        label={`完成 ${todo.title}`}
        value={done}
        onValueChange={(v) => {
          if (v) haptics.success();
          setTodoDone(todo.id, v);
        }}
      />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`编辑 ${todo.title}`}
        haptic={false}
        scaleTo={0.99}
        onPress={() => router.push({ pathname: '/todo/[id]', params: { id: todo.id } })}
        style={styles.texts}>
        <Text variant="body" tone={done ? 'faint' : 'default'} numberOfLines={2} style={done && { textDecorationLine: 'line-through' }}>
          {todo.title}
        </Text>
        {due || todo.jobId ? (
          <View style={styles.meta}>
            {due ? <Chip label={due.text} tone={done ? 'neutral' : due.tone} /> : null}
            {todo.jobId && !done ? <Icon name="bell" size={12} color={c.textFaint} /> : null}
          </View>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

/** Open to-dos, quick add, and a collapsible "done" group. */
export function TodoList({ todos, now }: { todos: Todo[]; now: Date }) {
  const c = useTheme();
  const [draft, setDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const open = todos.filter((t) => !t.doneAt);
  const done = todos.filter((t) => t.doneAt);

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    haptics.tap();
    await addTodo({ title, source: 'user' });
  };

  return (
    <View style={[styles.group, { backgroundColor: c.surface }]}>
      {open.map((t) => (
        <TodoRow key={t.id} todo={t} now={now} />
      ))}
      <View style={[styles.add, open.length > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
        <Icon name="plus" size={18} color={c.accent} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          placeholder="添加待办，回车保存"
          placeholderTextColor={c.textFaint}
          returnKeyType="done"
          submitBehavior="submit"
          accessibilityLabel="添加待办"
          style={[styles.input, { color: c.text }]}
        />
        {draft ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="更多选项" onPress={() => router.push({ pathname: '/todo/[id]', params: { id: 'new', title: draft } })}>
            <Text variant="callout" tone="accent">
              详细
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {done.length ? (
        <>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={showDone ? '收起已完成' : '展开已完成'}
            haptic={false}
            onPress={() => setShowDone((v) => !v)}
            style={[styles.doneToggle, { borderTopColor: c.border }]}>
            <Text variant="caption" tone="faint">
              已完成 {done.length}
            </Text>
            <Icon name="chevronRight" size={14} color={c.textFaint} style={{ transform: [{ rotate: showDone ? '90deg' : '0deg' }] }} />
          </PressableScale>
          {showDone ? done.slice(0, 20).map((t) => <TodoRow key={t.id} todo={t} now={now} />) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.lg, minHeight: 52 },
  texts: { flex: 1, gap: spacing.xs, paddingVertical: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  add: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 52 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: typography.body.fontSize, paddingVertical: spacing.sm },
  doneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
