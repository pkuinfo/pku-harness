import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Chip } from '@/components/chip';
import { Field, SecretField } from '@/components/field';
import { Icon } from '@/components/icon';
import { Skeleton } from '@/components/skeleton';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { signIn, useCampusAccount } from '@/core/campus/account';
import { HOST_CAPABILITIES } from '@/core/runtime/registry';
import { useT } from '@/i18n';
import { typography, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { StepShell } from './step-shell';

/** Transport failures (no route, timeout, campus-only host) vs. answers from IAAA. */
const isNetworkError = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === 'ERR_NETWORK' || code === 'BAD_RESPONSE';
};

/**
 * Step 2 · Sign in to PKU (登录北大账号): the same IAAA sign-in as Settings → 校园账号 (src/core/campus/account.ts).
 * A second factor, when IAAA wants one, is asked by the root verification prompt.
 */
export function CampusStep({ onDone, onSkip, onBack }: { onDone: () => void; onSkip: () => void; onBack: () => void }) {
  const t = useT();
  const c = useTheme();
  const account = useCampusAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; network: boolean } | null>(null);
  const supported = HOST_CAPABILITIES.has('campus-session');
  // The name comes from the campus card a moment after sign-in; stop waiting for it after a while.
  const [nameTimedOut, setNameTimedOut] = useState(false);
  useEffect(() => {
    if (!account.signedIn || account.name) return;
    const timer = setTimeout(() => setNameTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [account.signedIn, account.name]);

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      setPassword('');
      haptics.success();
    } catch (e) {
      haptics.warning();
      setError({ text: e instanceof Error ? e.message : String(e), network: isNetworkError(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <StepShell step="campus" icon="person" title={t('welcome.campus.title')} why={t('welcome.campus.unsupported')} primary={t('welcome.step.continue')} onPrimary={onSkip} onBack={onBack} />
    );
  }

  if (account.signedIn) {
    return (
      <StepShell step="campus" icon="person" title={t('welcome.campus.title')} why={t('welcome.campus.signedInWhy')} primary={t('welcome.step.continue')} onPrimary={onDone} onBack={onBack}>
        <Animated.View entering={FadeIn}>
          <Surface level={1}>
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-up-muted">
                <Icon name="check" size={22} color={c.up} />
              </View>
              <View className="flex-1 gap-1">
                {account.name ? (
                  <Text variant="headline">{t('welcome.campus.hello', { name: account.name })}</Text>
                ) : nameTimedOut ? (
                  <Text variant="headline">{t('welcome.campus.signedIn')}</Text>
                ) : (
                  <Skeleton width="60%" height={typography.headline.lineHeight} />
                )}
                <Text variant="caption" tone="muted">
                  {account.username}
                </Text>
              </View>
              <Chip label={t('welcome.campus.signedIn')} tone="up" icon="lock" />
            </View>
          </Surface>
        </Animated.View>
      </StepShell>
    );
  }

  const canLogin = !!username.trim() && !!password;
  return (
    <StepShell
      step="campus"
      icon="person"
      title={t('welcome.campus.title')}
      why={t('welcome.campus.why')}
      primary={t('welcome.campus.signIn')}
      onPrimary={login}
      primaryLoading={busy}
      primaryDisabled={!canLogin}
      onSkip={onSkip}
      onBack={onBack}>
      <View className="gap-4">
        <Field label={t('welcome.campus.username')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} keyboardType="number-pad" textContentType="username" autoComplete="username" />
        <SecretField label={t('welcome.campus.password')} value={password} onChangeText={setPassword} textContentType="password" autoComplete="password" onSubmitEditing={canLogin ? login : undefined} returnKeyType="go" />
        <View className="flex-row gap-2">
          <Icon name="shield" size={16} color={c.textMuted} />
          <Text variant="caption" tone="muted" className="flex-1">
            {t('welcome.campus.explain')}
          </Text>
        </View>
        {error ? (
          <Animated.View entering={FadeIn} className="gap-1 rounded-md bg-down-muted p-3" style={{ borderCurve: 'continuous' }} accessibilityLiveRegion="polite">
            <Text variant="callout" tone="down">
              {error.text}
            </Text>
            {error.network ? (
              <Text variant="caption" tone="muted">
                {t('welcome.campus.networkHint')}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </StepShell>
  );
}
