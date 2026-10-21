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
import { useT } from '@/i18n';
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
  const t = useT();
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
    await notifyAt(at, { title: t('app.notifications.testTitle'), body: t('app.notifications.testBody', { time: formatClock(at, true) }), url: '/notifications' });
    setTestAt(at.getTime());
    haptics.success();
    refresh();
  };

  const granted = status?.permission === 'granted';
  return (
    <Screen title={t('app.notifications.title')} subtitle={t('app.notifications.eyebrow')} back>
      <FadeIn index={0}>
        <Text variant="callout" tone="muted">
          {t('app.notifications.intro')}
        </Text>
      </FadeIn>
      <FadeIn index={1}>
        <ListGroup title={t('app.notifications.system')}>
          <ListRow
            icon="bell"
            title={t('app.notifications.notifications')}
            subtitle={granted ? t('app.notifications.granted') : status?.permission === 'denied' ? t('app.notifications.denied') : t('app.notifications.notGranted')}
            accessory={
              status == null ? null : granted ? (
                <Chip label={t('app.ui.enabled')} tone="up" icon="check" />
              ) : (
                <Button title={status.permission === 'denied' ? t('core.common.goSettings') : t('app.notifications.allow')} size="sm" onPress={allow} />
              )
            }
          />
          {Platform.OS === 'android' ? (
            <ListRow
              icon="alarm"
              title={t('app.notifications.exact')}
              subtitle={status?.exact ? t('app.notifications.exactOn') : t('app.notifications.exactOff')}
              accessory={
                status == null ? null : status.exact ? (
                  <Chip label={t('app.ui.enabled')} tone="up" icon="check" />
                ) : (
                  <Button
                    title={t('app.notifications.turnOn')}
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
            title={t('app.notifications.background')}
            subtitle={t('app.notifications.backgroundSubtitle')}
            accessory={status == null ? null : <Chip label={status.background ? t('app.notifications.available') : t('app.notifications.limited')} tone={status.background ? 'up' : 'warn'} />}
          />
        </ListGroup>
      </FadeIn>
      <FadeIn index={2}>
        <ListGroup title={t('app.notifications.status')} footer={testAt ? t('app.notifications.testFooter') : undefined}>
          <ListRow icon="calendarClock" title={t('app.notifications.scheduled')} value={status ? t('app.notifications.scheduledCount', { count: status.scheduled }) : '—'} />
          <ListRow icon="send2" title={t('app.notifications.test')} subtitle={t('app.notifications.testSubtitle')} onPress={test} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
