import { useState } from 'react';
import { View } from 'react-native';

import { Chip } from '@/components/chip';
import { Field, SecretField } from '@/components/field';
import { ListGroup, ListRow } from '@/components/list-group';
import { dismiss, SheetScreen } from '@/components/sheet-screen';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { signIn, signOut, useCampusAccount } from '@/core/campus/account';
import { invokeTool } from '@/core/runtime/invoke';
import { spacing } from '@/theme';
import { haptics } from '@/utils/haptics';

/**
 * Settings → 校园账号. The user types their IAAA credentials here; they go straight to the
 * device keystore and are only ever sent to PKU's own login endpoints.
 */
export function CampusAccountScreen() {
  const account = useCampusAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'up' | 'down'; text: string; network?: boolean } | null>(null);

  const login = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await signIn(username, password);
      setPassword('');
      haptics.success();
      setMessage({ tone: 'up', text: '登录成功' });
    } catch (e) {
      haptics.warning();
      setMessage({ tone: 'down', text: e instanceof Error ? e.message : String(e), network: isNetworkError(e) });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = (await invokeTool('campus-card.getBalance', {}, { actor: 'user' })) as { balance: number | null };
      setMessage({ tone: 'up', text: `连接正常，校园卡余额 ¥${r.balance?.toFixed(2) ?? '—'}` });
      haptics.success();
    } catch (e) {
      setMessage({ tone: 'down', text: e instanceof Error ? e.message : String(e), network: isNetworkError(e) });
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  if (account.signedIn) {
    return (
      <SheetScreen title="校园账号" primary="测试校园卡连接" onPrimary={test} loading={busy} danger="退出登录" onDanger={async () => {
        haptics.warning();
        await signOut();
        setMessage(null);
      }}>
        <ListGroup>
          <ListRow icon="person" title={account.name ?? account.username ?? '已登录'} subtitle={[account.name ? account.username : null, account.signedInAt ? `登录于 ${new Date(account.signedInAt).toLocaleString('zh-CN', { hour12: false })}` : null].filter(Boolean).join(' · ')} accessory={<Chip label="已登录" tone="up" icon="check" />} />
        </ListGroup>
        <Text variant="callout" tone="muted">
          插件通过本机代为登录各个校园服务，拿不到你的密码。退出登录会删除本机保存的密码和所有会话。
        </Text>
        {message ? <Status message={message} /> : null}
      </SheetScreen>
    );
  }

  return (
    <SheetScreen title="登录校园账号" primary="登录" onPrimary={login} loading={busy} primaryDisabled={!username.trim() || !password} secondary="取消" onSecondary={() => dismiss('/settings')}>
      <Text variant="callout" tone="muted">
        使用 IAAA 统一身份认证（与门户相同的学号和密码）。密码只保存在本机安全存储中，只会发送给学校的登录服务。
      </Text>
      <Field label="学号 / 职工号" value={username} onChangeText={setUsername} autoCapitalize="none" keyboardType="number-pad" autoFocus />
      <SecretField label="密码" value={password} onChangeText={setPassword} textContentType="password" autoComplete="password" />
      <Text variant="caption" tone="faint">
        如果账号开启了短信验证或手机令牌，登录时会提示你输入验证码。
      </Text>
      {message ? <Status message={message} /> : null}
    </SheetScreen>
  );
}

/** Transport failures (no route, timeout, campus-only host) vs. answers from the service. */
const isNetworkError = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === 'ERR_NETWORK' || code === 'BAD_RESPONSE';
};

function Status({ message }: { message: { tone: 'up' | 'down'; text: string; network?: boolean } }) {
  return (
    <Surface level={2}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="callout" tone={message.tone}>
          {message.text}
        </Text>
        {message.tone === 'down' && message.network ? (
          <Text variant="caption" tone="muted">
            部分服务只能在校园网内访问；如果在校外，请连接校园网后再试。
          </Text>
        ) : null}
      </View>
    </Surface>
  );
}

