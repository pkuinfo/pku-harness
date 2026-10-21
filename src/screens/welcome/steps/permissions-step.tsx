import { useState, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FadeIn as Enter } from '@/components/fade-in';
import { GlassEdges } from '@/components/glass';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { openBatteryOptimizationSettings, requestExactAlarmPermission, requestNotificationPermission } from '@/core/notify';
import { deliveryBlocker } from '@/core/runtime/types';
import { useDeliveryReadiness } from '@/hooks/use-delivery-readiness';
import { useT } from '@/i18n';
import { radius, useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { permissionsOutcome } from '../flow';
import { StepShell } from './step-shell';

type Kind = 'notifications' | 'exactAlarms' | 'battery';

function PermissionRow({
  icon,
  title,
  detail,
  badge,
  on,
  action,
  loading,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  badge: { label: string; required: boolean };
  /** null while the first read is in flight. */
  on: boolean | null;
  action: string;
  loading: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const c = useTheme();
  return (
    <View className="min-h-16 flex-row items-center gap-3 px-4 py-3">
      <View className={cx('h-9 w-9 items-center justify-center rounded-md', on ? 'bg-up-muted' : 'bg-accent-muted')} style={{ borderCurve: 'continuous' }}>
        <Icon name={icon} size={18} color={on ? c.up : c.accent} />
      </View>
      <View className="flex-1 gap-1">
        {/* Badge on its own row: the same shape whether the title is short or wraps. */}
        <Text variant="bodyStrong">{title}</Text>
        <View className="flex-row">
          <Chip label={badge.label} tone={badge.required ? 'accent' : 'neutral'} />
        </View>
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      </View>
      {on == null ? null : on ? (
        <Animated.View entering={FadeIn} accessible accessibilityLabel={t('welcome.permissions.rowA11y', { name: title, state: t('welcome.permissions.on') })}>
          <Chip label={t('welcome.permissions.on')} tone="up" icon="check" />
        </Animated.View>
      ) : (
        <Button title={action} size="sm" variant={badge.required ? 'primary' : 'secondary'} loading={loading} onPress={onPress} />
      )}
    </View>
  );
}

/**
 * Step 4 · 让提醒准时送达: the OS permissions on-time reminders and checks depend on. Each row
 * shows its live state and fixes itself in one tap (system prompt or system screen); the state
 * is re-read when the user comes back from system settings. Skippable, with the consequence
 * spelled out.
 */
export function PermissionsStep({ onDone, onSkip, onBack }: { onDone: () => void; onSkip: () => void; onBack: () => void }) {
  const t = useT();
  const c = useTheme();
  const { readiness: r, refresh } = useDeliveryReadiness();
  const [busy, setBusy] = useState<Kind | null>(null);
  const android = Platform.OS === 'android';

  const fix = async (kind: Kind) => {
    haptics.tap();
    setBusy(kind);
    try {
      if (kind === 'notifications') {
        if (r?.notifications === 'denied') await Linking.openSettings();
        else await requestNotificationPermission();
      } else if (kind === 'exactAlarms') await requestExactAlarmPermission();
      else await openBatteryOptimizationSettings();
    } catch {
      // A missing system screen leaves the state as it was; the row keeps its button.
    } finally {
      setBusy(null);
    }
    const next = await refresh();
    if (next && kind === 'notifications' && next.notifications === 'granted') haptics.success();
    if (next && kind === 'exactAlarms' && next.exactAlarms) haptics.success();
  };

  const blocker = r ? deliveryBlocker(r) : null;
  const finish = () => (r && permissionsOutcome(r) === 'done' ? onDone() : onSkip());

  const rows: { kind: Kind; el: ReactNode }[] = [
    {
      kind: 'notifications',
      el: (
        <PermissionRow
          icon="bell"
          title={t('welcome.permissions.notifications')}
          detail={r?.notifications === 'denied' ? t('welcome.permissions.notificationsDenied') : t('welcome.permissions.notificationsWhy')}
          badge={{ label: t('welcome.permissions.required'), required: true }}
          on={r ? r.notifications === 'granted' : null}
          action={r?.notifications === 'denied' ? t('welcome.permissions.openSettings') : t('welcome.permissions.allow')}
          loading={busy === 'notifications'}
          onPress={() => void fix('notifications')}
        />
      ),
    },
  ];
  if (android) {
    rows.push(
      {
        kind: 'exactAlarms',
        el: (
          <PermissionRow
            icon="alarm"
            title={t('welcome.permissions.exact')}
            detail={t('welcome.permissions.exactWhy')}
            badge={{ label: t('welcome.permissions.required'), required: true }}
            on={r ? r.exactAlarms : null}
            action={t('welcome.permissions.turnOn')}
            loading={busy === 'exactAlarms'}
            onPress={() => void fix('exactAlarms')}
          />
        ),
      },
      {
        kind: 'battery',
        el: (
          <PermissionRow
            icon="battery"
            title={t('welcome.permissions.battery')}
            detail={r && !r.batteryOptimized ? t('welcome.permissions.batteryOn') : t('welcome.permissions.batteryWhy')}
            badge={{ label: t('welcome.permissions.recommended'), required: false }}
            on={r ? !r.batteryOptimized : null}
            action={t('welcome.permissions.openSettings')}
            loading={busy === 'battery'}
            onPress={() => void fix('battery')}
          />
        ),
      },
    );
  }

  return (
    <StepShell
      step="permissions"
      icon="alarm"
      title={t('welcome.permissions.title')}
      why={t('welcome.permissions.why')}
      primary={t('welcome.step.continue')}
      onPrimary={finish}
      onSkip={onSkip}
      onBack={onBack}
      note={t('welcome.permissions.note')}>
      <Enter index={3}>
        <View className="overflow-hidden rounded-lg bg-surface" style={{ borderCurve: 'continuous' }}>
          <GlassEdges radius={radius.lg} />
          {rows.map((row, i) => (
            <View key={row.kind}>
              {i > 0 ? <View className="ml-16 bg-edge" style={{ height: StyleSheet.hairlineWidth }} /> : null}
              {row.el}
            </View>
          ))}
        </View>
      </Enter>
      {blocker ? (
        <Animated.View key={blocker} entering={FadeIn} exiting={FadeOut} className="flex-row items-start gap-2 px-4" accessibilityLiveRegion="polite">
          <Icon name="warning" size={16} color={c.warn} />
          <Text variant="caption" tone="warn" className="flex-1">
            {blocker === 'notifications' ? t('welcome.permissions.missingNotifications') : t('welcome.permissions.missingExact')}
          </Text>
        </Animated.View>
      ) : null}
    </StepShell>
  );
}
