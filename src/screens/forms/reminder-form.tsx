import { TimePickerDialog } from '@expo/ui/jetpack-compose';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { DateTimeField, pickerColors } from '@/components/date-time-field';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { NativeHost } from '@/components/native-host';
import { PressableScale } from '@/components/pressable-scale';
import { Segmented } from '@/components/segmented';
import { dismiss, SheetScreen } from '@/components/sheet-screen';
import { Stepper } from '@/components/stepper';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { WeekdayPicker } from '@/components/weekday-picker';
import { createJob, deleteJob, updateJob } from '@/core/scheduler/engine';
import { formatTime } from '@/core/scheduler/recurrence';
import { summarize } from '@/core/scheduler/schedule-input';
import { jobStore } from '@/core/scheduler/store';
import type { Trigger } from '@/core/scheduler/types';
import { radius, spacing, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

type Unit = 'day' | 'week' | 'hour' | 'minute';
type End = 'never' | 'count' | 'until';

const UNITS: { label: string; value: Unit }[] = [
  { label: '按天', value: 'day' },
  { label: '按周', value: 'week' },
  { label: '按小时', value: 'hour' },
  { label: '按分钟', value: 'minute' },
];
const ENDS: { label: string; value: End }[] = [
  { label: '一直重复', value: 'never' },
  { label: '重复次数', value: 'count' },
  { label: '截止日期', value: 'until' },
];
const OP_TEXT: Record<string, string> = { '<': '小于', '<=': '不超过', '>': '大于', '>=': '至少', '==': '等于', '!=': '不等于', changed: '变化时', always: '每次' };

function TimeChips({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  const c = useTheme();
  const [editing, setEditing] = useState<number | null>(null);
  const sorted = [...times].sort();
  const initial = () => {
    const [h, m] = (editing != null && editing < sorted.length ? sorted[editing] : '08:00').split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  return (
    <View style={styles.chips}>
      {sorted.map((t, i) => (
        <PressableScale
          key={t}
          accessibilityRole="button"
          accessibilityLabel={`修改时间 ${t}`}
          onPress={() => setEditing(i)}
          onLongPress={() => sorted.length > 1 && onChange(sorted.filter((x) => x !== t))}
          style={[styles.time, { backgroundColor: c.accentMuted }]}>
          <Text variant="bodyStrong" tone="accent" style={{ fontVariant: ['tabular-nums'] }}>
            {t}
          </Text>
          {sorted.length > 1 ? (
            <PressableScale accessibilityRole="button" accessibilityLabel={`删除时间 ${t}`} haptic={false} onPress={() => onChange(sorted.filter((x) => x !== t))}>
              <Icon name="close" size={14} color={c.accent} />
            </PressableScale>
          ) : null}
        </PressableScale>
      ))}
      {sorted.length < 12 ? (
        <PressableScale accessibilityRole="button" accessibilityLabel="添加时间" onPress={() => setEditing(sorted.length)} style={[styles.time, { backgroundColor: c.surface2 }]}>
          <Icon name="plus" size={16} color={c.textMuted} />
          <Text variant="callout" tone="muted">
            时间
          </Text>
        </PressableScale>
      ) : null}
      {editing != null ? (
        <NativeHost>
          <TimePickerDialog
            initialDate={initial()}
            is24Hour
            confirmButtonLabel="确定"
            dismissButtonLabel="取消"
            color={c.accent}
            elementColors={pickerColors(c)}
            onDateSelected={(d) => {
              const t = formatTime(d.getHours(), d.getMinutes());
              const next = sorted.slice();
              if (editing < next.length) next[editing] = t;
              else next.push(t);
              onChange([...new Set(next)]);
              setEditing(null);
            }}
            onDismissRequest={() => setEditing(null)}
          />
        </NativeHost>
      ) : null}
    </View>
  );
}

/** Create or edit a stand-alone reminder (or the schedule of a check job). */
export function ReminderForm({ id }: { id: string }) {
  const c = useTheme();
  const existing = id === 'new' ? undefined : jobStore.get(id);
  const t = existing?.trigger;
  const every = t?.type === 'every' ? t : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.action.type === 'notify' ? (existing.action.body ?? '') : '');
  const [kind, setKind] = useState<'once' | 'repeat'>(every ? 'repeat' : 'once');
  const [at, setAt] = useState<Date>(() => (t?.type === 'at' ? new Date(t.at) : nextHour()));
  const [unit, setUnit] = useState<Unit>(every?.unit ?? 'day');
  const [interval, setInterval] = useState(every?.interval ?? 1);
  const [times, setTimes] = useState<string[]>(every?.times ?? ['08:00']);
  const [weekdays, setWeekdays] = useState<number[]>(every?.weekdays ?? [new Date().getDay()]);
  const [start, setStart] = useState<Date>(() => (every ? new Date(every.startAt) : new Date()));
  const [end, setEnd] = useState<End>(every?.count ? 'count' : every?.until ? 'until' : 'never');
  const [count, setCount] = useState(every?.count ?? 10);
  const [until, setUntil] = useState<Date>(() => (every?.until ? new Date(every.until) : new Date(Date.now() + 30 * 86_400_000)));

  const trigger: Trigger = useMemo(() => {
    if (kind === 'once') return { type: 'at', at: at.getTime() };
    return {
      type: 'every',
      unit,
      interval,
      times: unit === 'day' || unit === 'week' ? times : undefined,
      weekdays: unit === 'week' ? weekdays : undefined,
      startAt: unit === 'hour' || unit === 'minute' ? Math.floor(start.getTime() / 60_000) * 60_000 : new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime(),
      count: end === 'count' ? count : undefined,
      until: end === 'until' ? new Date(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59).getTime() : undefined,
    };
  }, [kind, at, unit, interval, times, weekdays, start, end, count, until]);
  const [openedAt] = useState(() => Date.now());
  const preview = summarize(trigger, openedAt, 3);

  const save = async () => {
    const name = title.trim();
    if (existing) {
      await updateJob(existing.id, {
        title: name,
        trigger,
        action: existing.action.type === 'notify' ? { ...existing.action, title: name, body: body.trim() || undefined } : existing.action,
        enabled: true,
      });
    } else {
      await createJob({ title: name, trigger, action: { type: 'notify', title: name, body: body.trim() || undefined, url: '/schedule' }, source: 'user' });
    }
    haptics.success();
    dismiss();
  };

  const check = existing?.action.type === 'check' ? existing.action : null;

  return (
    <SheetScreen
      title={existing ? (check ? '编辑定时检查' : '编辑提醒') : '新提醒'}
      primary="保存"
      onPrimary={save}
      primaryDisabled={!title.trim() || preview.finished}
      danger={existing ? '删除' : undefined}
      onDanger={async () => {
        haptics.warning();
        if (existing) await deleteJob(existing.id);
        dismiss();
      }}>
      <Field label="标题" value={title} onChangeText={setTitle} placeholder="例如：喝水、交电费" autoFocus={!existing} />
      {check ? (
        <Surface level={2} style={{ gap: spacing.xs }}>
          <Text variant="callout">
            查询 {check.tool}
            {check.condition.path ? ` 的 ${check.condition.path}` : ''}，{OP_TEXT[check.condition.op]}
            {check.condition.value != null ? ` ${String(check.condition.value)}` : ''} 时通知
          </Text>
          <Text variant="caption" tone="muted">
            检查条件由 AI 创建，可以在对话里让它修改。
          </Text>
        </Surface>
      ) : (
        <Field label="内容" value={body} onChangeText={setBody} placeholder="可选，显示在通知里" />
      )}

      <Segmented
        options={[
          { label: '一次', value: 'once' },
          { label: '重复', value: 'repeat' },
        ]}
        value={kind}
        onChange={setKind}
      />

      {kind === 'once' ? (
        <DateTimeField label="时间" value={at} onChange={setAt} />
      ) : (
        <>
          <Segmented options={UNITS} value={unit} onChange={setUnit} />
          <View style={styles.line}>
            <Text variant="body">每</Text>
            <Stepper label="间隔" value={interval} onChange={setInterval} max={unit === 'hour' ? 23 : unit === 'minute' ? 720 : 365} />
            <Text variant="body">{unit === 'day' ? '天' : unit === 'week' ? '周' : unit === 'hour' ? '小时' : '分钟'}</Text>
          </View>
          {unit === 'week' ? <WeekdayPicker value={weekdays} onChange={setWeekdays} multiple /> : null}
          {unit === 'day' || unit === 'week' ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="callout" tone="muted">
                提醒时间
              </Text>
              <TimeChips times={times} onChange={setTimes} />
            </View>
          ) : null}
          <DateTimeField
            label={unit === 'hour' || unit === 'minute' ? '从' : '开始日期'}
            value={start}
            onChange={setStart}
            mode={unit === 'hour' || unit === 'minute' ? 'datetime' : 'date'}
          />
          <View style={{ gap: spacing.sm }}>
            <Text variant="callout" tone="muted">
              结束
            </Text>
            <Segmented options={ENDS} value={end} onChange={setEnd} />
            {end === 'count' ? (
              <View style={styles.line}>
                <Text variant="body">共</Text>
                <Stepper label="次数" value={count} onChange={setCount} max={999} />
                <Text variant="body">次后停止</Text>
              </View>
            ) : null}
            {end === 'until' ? <DateTimeField label="截止日期（含当天）" value={until} onChange={setUntil} mode="date" /> : null}
          </View>
        </>
      )}

      <View style={[styles.preview, { backgroundColor: c.surface, borderColor: preview.finished ? c.warn : c.border }]}>
        <View style={styles.line}>
          <Icon name="calendarClock" size={16} color={c.textMuted} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {preview.schedule}
          </Text>
          {preview.total ? <Chip label={`共 ${preview.total} 次`} /> : null}
        </View>
        {preview.finished ? (
          <Text variant="caption" tone="warn">
            这个时间已经过去了
          </Text>
        ) : (
          preview.next.map((n) => (
            <Text key={n} variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
              {n}
            </Text>
          ))
        )}
      </View>
    </SheetScreen>
  );
}

function nextHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  time: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.full,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  preview: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1 },
});
