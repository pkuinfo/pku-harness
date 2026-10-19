import * as BackgroundTask from 'expo-background-task';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FadeIn } from '@/components/fade-in';
import { ListGroup, ListRow } from '@/components/list-group';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { formatClock } from '@/utils/date';
import {
  getExactAlarmPermission,
  getNotificationPermission,
  listScheduledNotifications,
  notifyAt,
  requestExactAlarmPermission,
  requestNotificationPermission,
  type PermissionState,
} from '@/core/notify';
import { haptics } from '@/utils/haptics';

type Status = {
  permission: PermissionState;
  exact: boolean;
  background: boolean;
  scheduled: number;
};

async function readStatus(): Promise<Status> {
  const [permission, exact, bg, scheduled] = await Promise.all([
    getNotificationPermission(),
    getExactAlarmPermission(),
    BackgroundTask.getStatusAsync(),
    listScheduledNotifications(),
  ]);
  return { permission, exact, background: bg === BackgroundTask.BackgroundTaskStatus.Available, scheduled: scheduled.length };
}

/** Settings → 提醒与通知: what the scheduler needs from the OS, and a test button. */
export function NotificationSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [testAt, setTestAt] = useState<number | null>(null);

  const refresh = useCallback(() => {
    readStatus().then(setStatus).catch(() => {});
  }, []);
  useFocusEffect(refresh);
  useEffect(() => {
    // Exact-alarm and notification settings are changed in system screens; re-read on return.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const allow = async () => {
    const p = status?.permission === 'denied' ? (await Linking.openSettings(), 'denied') : await requestNotificationPermission();
    if (p === 'granted') haptics.success();
    refresh();
  };

  const test = async () => {
    if (status?.permission !== 'granted') {
      const p = await requestNotificationPermission();
      if (p !== 'granted') return refresh();
    }
    const at = new Date(Date.now() + 10_000);
    await notifyAt(at, { title: '测试提醒', body: `计划于 ${formatClock(at, true)} 送达`, url: '/notifications' });
    setTestAt(at.getTime());
    haptics.success();
    refresh();
  };

  const granted = status?.permission === 'granted';
  return (
    <Screen title="提醒与通知" subtitle="Notifications" back>
      <FadeIn index={0}>
        <Text variant="callout" tone="muted">
          提醒和定时检查在本机运行：到点由系统闹钟准时唤起通知，不经过任何服务器。
        </Text>
      </FadeIn>
      <FadeIn index={1}>
        <ListGroup title="系统权限">
          <ListRow
            icon="bell"
            title="通知"
            subtitle={granted ? '已允许' : status?.permission === 'denied' ? '已被拒绝，请在系统设置中开启' : '尚未允许'}
            accessory={
              status == null ? null : granted ? (
                <Chip label="已开启" tone="up" icon="check" />
              ) : (
                <Button title={status.permission === 'denied' ? '去设置' : '允许'} size="sm" onPress={allow} />
              )
            }
          />
          {Platform.OS === 'android' ? (
            <ListRow
              icon="alarm"
              title="精确闹钟"
              subtitle={status?.exact ? '提醒会准时送达' : '未开启时，系统可能延后几分钟送达'}
              accessory={
                status == null ? null : status.exact ? (
                  <Chip label="已开启" tone="up" icon="check" />
                ) : (
                  <Button
                    title="开启"
                    size="sm"
                    onPress={async () => {
                      await requestExactAlarmPermission();
                      refresh();
                    }}
                  />
                )
              }
            />
          ) : null}
          <ListRow
            icon="refresh"
            title="后台检查"
            subtitle="定期查询余额等数据，满足条件时通知你"
            accessory={status == null ? null : <Chip label={status.background ? '可用' : '受限'} tone={status.background ? 'up' : 'warn'} />}
          />
        </ListGroup>
      </FadeIn>
      <FadeIn index={2}>
        <ListGroup title="状态" footer={testAt ? '测试提醒已排定，10 秒后送达。可以退到桌面或锁屏观察。' : undefined}>
          <ListRow icon="calendarClock" title="已排定的通知" value={status ? `${status.scheduled} 条` : '—'} />
          <ListRow icon="send2" title="发送测试提醒" subtitle="10 秒后送达" onPress={test} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
