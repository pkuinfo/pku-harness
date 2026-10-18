import { useState } from 'react';
import { View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { Field } from '@/components/field';
import { Segmented } from '@/components/segmented';
import { dismiss, SheetScreen } from '@/components/sheet-screen';
import { Text } from '@/components/text';
import { describeTrigger } from '@/core/scheduler/recurrence';
import { jobStore } from '@/core/scheduler/store';
import { addTodo, deleteTodo, todoStore, updateTodo } from '@/core/todo';
import { spacing } from '@/theme';
import { haptics } from '@/utils/haptics';

type RemindMode = 'none' | 'atDue' | 'before15' | 'before60' | 'custom';

const MODES: { label: string; value: RemindMode }[] = [
  { label: '不提醒', value: 'none' },
  { label: '到期时', value: 'atDue' },
  { label: '提前15分', value: 'before15' },
  { label: '提前1时', value: 'before60' },
];

/** Create or edit a to-do: title, notes, due time, reminder. */
export function TodoForm({ id, initialTitle }: { id: string; initialTitle?: string }) {
  const existing = id === 'new' ? undefined : todoStore.get(id);
  const job = existing?.jobId ? jobStore.get(existing.jobId) : undefined;
  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [due, setDue] = useState<Date | null>(existing?.dueAt ? new Date(existing.dueAt) : null);
  const [mode, setMode] = useState<RemindMode>(() => {
    if (!job) return 'none';
    if (job.trigger.type !== 'at' || !existing?.dueAt) return 'custom';
    const diff = existing.dueAt - job.trigger.at;
    return diff === 0 ? 'atDue' : diff === 15 * 60_000 ? 'before15' : diff === 60 * 60_000 ? 'before60' : 'custom';
  });

  const [hadCustom] = useState(mode === 'custom');

  const remind = () => {
    if (mode === 'custom') return undefined; // keep whatever the agent set up
    if (mode === 'none' || !due) return null;
    const before = mode === 'before15' ? 15 : mode === 'before60' ? 60 : 0;
    return { type: 'at' as const, at: due.getTime() - before * 60_000 };
  };

  const save = async () => {
    const dueAt = due ? due.getTime() : null;
    if (existing) await updateTodo(existing.id, { title, notes, dueAt, remind: remind() }, 'user');
    else await addTodo({ title, notes, dueAt, remind: remind(), source: 'user' });
    haptics.success();
    dismiss();
  };

  return (
    <SheetScreen
      title={existing ? '编辑待办' : '新待办'}
      primary="保存"
      onPrimary={save}
      primaryDisabled={!title.trim()}
      danger={existing ? '删除' : undefined}
      onDanger={async () => {
        haptics.warning();
        if (existing) await deleteTodo(existing.id);
        dismiss();
      }}>
      <Field label="内容" value={title} onChangeText={setTitle} placeholder="例如：交高数作业" autoFocus={!existing && !initialTitle} />
      <Field label="备注" value={notes} onChangeText={setNotes} placeholder="可选" multiline />
      <DateTimeField label="截止时间" value={due} onChange={setDue} onClear={() => setDue(null)} />
      <View style={{ gap: spacing.sm }}>
        <Text variant="callout" tone="muted">
          提醒
        </Text>
        <Segmented options={hadCustom ? [...MODES, { label: '自定义', value: 'custom' }] : MODES} value={mode} onChange={setMode} />
        {mode === 'custom' && job ? (
          <Text variant="caption" tone="muted">
            {describeTrigger(job.trigger)}（可在对话里让 AI 修改）
          </Text>
        ) : null}
        {mode !== 'none' && mode !== 'custom' && !due ? (
          <Text variant="caption" tone="warn">
            先设置截止时间才能提醒
          </Text>
        ) : null}
      </View>
    </SheetScreen>
  );
}
