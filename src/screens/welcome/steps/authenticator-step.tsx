import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Field } from '@/components/field';
import { Icon, type IconName } from '@/components/icon';
import { NativeCheckbox } from '@/components/native-checkbox';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { useCampusAccount } from '@/core/campus/account';
import { bindFinish, bindStart, useOtpStatus } from '@/core/campus/otp';
import { addPluginWidget } from '@/core/dashboard/starter';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { useT } from '@/i18n';
import { useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { StepShell } from './step-shell';

const WIDGET = { plugin: 'authenticator', widget: 'code' } as const;

/**
 * Step 3 · 手机令牌 (authenticator): bind this app as the IAAA TOTP authenticator
 * (src/core/campus/otp.ts, the same flow as Settings → 手机令牌) and put the code widget on the
 * dashboard. Opt-in: binding replaces the user's existing authenticator, so it needs their
 * acknowledgement, and 暂不设置 skips it.
 */
export function AuthenticatorStep({ onDone, onSkip, onBack }: { onDone: () => void; onSkip: () => void; onBack: () => void }) {
  const t = useT();
  const c = useTheme();
  const account = useCampusAccount();
  const otp = useOtpStatus();
  const [agreed, setAgreed] = useState(false);
  const [sentTo, setSentTo] = useState<string | null | undefined>(undefined); // undefined: not sent yet
  const [sms, setSms] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One SMS a minute, like the sign-in verification prompt.
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // Bound (here or earlier): make sure the plugin is on and its code is on the dashboard.
  useEffect(() => {
    if (!otp.bound) return;
    void pluginSettings.update('authenticator', { enabled: true });
    void addPluginWidget(WIDGET, t('welcome.authenticator.widgetTitle'));
  }, [otp.bound, t]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      haptics.warning();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      const r = await bindStart();
      setSentTo(r.sentTo);
      setCooldown(60);
    });
  const bind = () =>
    run(async () => {
      await bindFinish(sms);
      haptics.success();
    });

  const shell = { step: 'authenticator' as const, icon: 'key' as IconName, title: t('welcome.authenticator.title'), onBack };

  if (!account.signedIn) {
    return <StepShell {...shell} why={t('welcome.authenticator.needsSignIn')} primary={t('welcome.step.continue')} onPrimary={onSkip} />;
  }

  if (otp.bound) {
    return (
      <StepShell {...shell} why={t('welcome.authenticator.boundWhy')} primary={t('welcome.step.continue')} onPrimary={onDone}>
        <Animated.View entering={FadeIn}>
          <Surface level={1}>
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-up-muted">
                <Icon name="check" size={22} color={c.up} />
              </View>
              <Text variant="bodyStrong" className="flex-1">
                {t('welcome.authenticator.bound')}
              </Text>
            </View>
          </Surface>
        </Animated.View>
      </StepShell>
    );
  }

  const sent = sentTo !== undefined;
  const canBind = /^\d{4,8}$/.test(sms.trim());
  return (
    <StepShell
      {...shell}
      why={t('welcome.authenticator.why')}
      primary={sent ? t('welcome.authenticator.bind') : t('welcome.authenticator.send')}
      onPrimary={() => void (sent ? bind() : send())}
      primaryLoading={busy}
      primaryDisabled={sent ? !canBind : !agreed}
      onSkip={onSkip}
      skipLabel={t('welcome.authenticator.later')}>
      <View className="gap-4">
        {(
          [
            ['warning', 'welcome.authenticator.replaces'],
            ['shield', 'welcome.authenticator.stays'],
            ['bell', 'welcome.authenticator.sms'],
          ] as const
        ).map(([icon, key]) => (
          <View key={key} className="flex-row gap-3">
            <Icon name={icon} size={18} color={icon === 'warning' ? c.warn : c.textMuted} style={{ marginTop: 2 }} />
            <Text variant="callout" tone="muted" className="flex-1">
              {t(key)}
            </Text>
          </View>
        ))}
        {sent ? (
          <Animated.View entering={FadeIn} className="gap-2">
            <Text variant="caption" tone="muted">
              {sentTo ? t('welcome.authenticator.sentTo', { to: sentTo }) : t('welcome.authenticator.sentToPhone')}
            </Text>
            <Field
              label={t('welcome.authenticator.code')}
              value={sms}
              onChangeText={setSms}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              onSubmitEditing={canBind ? () => void bind() : undefined}
            />
            <Pressable onPress={() => void send()} disabled={busy || cooldown > 0} accessibilityRole="button" hitSlop={8} className="self-start py-2">
              <Text variant="callout" tone={cooldown > 0 ? 'faint' : 'accent'}>
                {cooldown > 0 ? `${t('welcome.authenticator.resend')} (${cooldown})` : t('welcome.authenticator.resend')}
              </Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Pressable onPress={() => setAgreed((a) => !a)} accessibilityRole="none" className="flex-row items-center gap-3 py-1">
            <NativeCheckbox value={agreed} onValueChange={setAgreed} label={t('welcome.authenticator.agree')} />
            <Text variant="callout" className="flex-1">
              {t('welcome.authenticator.agree')}
            </Text>
          </Pressable>
        )}
        {error ? (
          <Animated.View entering={FadeIn} className="rounded-md bg-down-muted p-3" style={{ borderCurve: 'continuous' }} accessibilityLiveRegion="polite">
            <Text variant="callout" tone="down">
              {error}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </StepShell>
  );
}
