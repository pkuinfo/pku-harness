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
import { typography, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { StepShell } from './step-shell';

/** Transport failures (no route, timeout, campus-only host) vs. answers from IAAA. */
const isNetworkError = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === 'ERR_NETWORK' || code === 'BAD_RESPONSE';
};

/**
 * Step 2 · 登录北大账号: the same IAAA sign-in as Settings → 校园账号 (src/core/campus/account.ts).
 * A second factor, when IAAA wants one, is asked by the root verification prompt.
 */
export function CampusStep({ onDone, onSkip, onBack }: { onDone: () => void; onSkip: () => void; onBack: () => void }) {
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
    const t = setTimeout(() => setNameTimedOut(true), 8000);
    return () => clearTimeout(t);
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
      <StepShell step="campus" icon="person" title="登录北大账号" why="这台设备暂不支持校园账号登录，可以先跳过。" primary="继续" onPrimary={onSkip} onBack={onBack} />
    );
  }

  if (account.signedIn) {
    return (
      <StepShell step="campus" icon="person" title="登录北大账号" why="已登录。插件通过本机代为登录各个校园服务，拿不到你的密码。" primary="继续" onPrimary={onDone} onBack={onBack}>
        <Animated.View entering={FadeIn}>
          <Surface level={1}>
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-up-muted">
                <Icon name="check" size={22} color={c.up} />
              </View>
              <View className="flex-1 gap-1">
                {account.name ? (
                  <Text variant="headline">你好，{account.name}</Text>
                ) : nameTimedOut ? (
                  <Text variant="headline">已登录</Text>
                ) : (
                  <Skeleton width="60%" height={typography.headline.lineHeight} />
                )}
                <Text variant="caption" tone="muted">
                  {account.username}
                </Text>
              </View>
              <Chip label="已登录" tone="up" icon="lock" />
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
      title="登录北大账号"
      why="登录一次，课表、校园卡、网费等服务就都能用。"
      primary="登录"
      onPrimary={login}
      primaryLoading={busy}
      primaryDisabled={!canLogin}
      onSkip={onSkip}
      onBack={onBack}>
      <View className="gap-4">
        <Field label="学号 / 职工号" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} keyboardType="number-pad" textContentType="username" autoComplete="username" />
        <SecretField label="密码" value={password} onChangeText={setPassword} textContentType="password" autoComplete="password" onSubmitEditing={canLogin ? login : undefined} returnKeyType="go" />
        <View className="flex-row gap-2">
          <Icon name="shield" size={16} color={c.textMuted} />
          <Text variant="caption" tone="muted" className="flex-1">
            与门户相同的 IAAA 账号。密码只存在这台手机的安全存储里，只发给学校的登录服务。需要短信验证时会提示你输入验证码。
          </Text>
        </View>
        {error ? (
          <Animated.View entering={FadeIn} className="gap-1 rounded-md bg-down-muted p-3" style={{ borderCurve: 'continuous' }} accessibilityLiveRegion="polite">
            <Text variant="callout" tone="down">
              {error.text}
            </Text>
            {error.network ? (
              <Text variant="caption" tone="muted">
                部分服务只能在校园网内访问；在校外请连接校园网后再试。
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </StepShell>
  );
}
