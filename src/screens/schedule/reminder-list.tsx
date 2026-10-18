import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { NativeSwitch } from '@/components/native-switch';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { updateJob } from '@/core/scheduler/engine';
import { describeTrigger } from '@/core/scheduler/recurrence';
import { formatLocal } from '@/core/scheduler/schedule-input';
import type { Job } from '@/core/scheduler/types';
import { radius, spacing, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

function ReminderRow({ job }: { job: Job }) {
  const c = useTheme();
  const finished = job.nextRunAt == null;
  const next = job.enabled && job.nextRunAt ? `下次 ${formatLocal(job.nextRunAt).slice(5, 16)}` : finished ? `已结束 · 共 ${job.runs} 次` : '已暂停';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`编辑提醒 ${job.title}`}
      scaleTo={0.99}
      haptic={false}
      onPress={() => router.push({ pathname: '/reminder/[id]', params: { id: job.id } })}
      style={styles.row}>
      <View style={[styles.icon, { backgroundColor: job.action.type === 'check' ? c.infoMuted : c.accentMuted }]}>
        <Icon name={job.action.type === 'check' ? 'refresh' : 'bell'} size={16} color={job.action.type === 'check' ? c.info : c.accent} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="body" numberOfLines={1} tone={job.enabled && !finished ? 'default' : 'faint'}>
          {job.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {describeTrigger(job.trigger)} · {next}
        </Text>
        {job.lastError ? (
          <Text variant="caption" tone="warn" numberOfLines={1}>
            上次检查失败：{job.lastError}
          </Text>
        ) : null}
      </View>
      {finished ? null : (
        <NativeSwitch
          label={`启用 ${job.title}`}
          value={job.enabled}
          onValueChange={(v) => {
            haptics.tap();
            updateJob(job.id, { enabled: v });
          }}
        />
      )}
    </PressableScale>
  );
}

/** Stand-alone reminders and checks (to-do and class reminders live with their owners). */
export function ReminderList({ jobs }: { jobs: Job[] }) {
  const c = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: c.surface }]}>
      {jobs.map((j, i) => (
        <View key={j.id} style={i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }}>
          <ReminderRow job={j} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 60 },
  icon: { width: 32, height: 32, borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
});
