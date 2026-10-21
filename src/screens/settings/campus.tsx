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
import { useT } from '@/i18n';
import { formatDateTime } from '@/utils/date';
import { haptics } from '@/utils/haptics';

/**
 * Settings → 校园账号. The user types their IAAA credentials here; they go straight to the
 * device keystore and are only ever sent to PKU's own login endpoints.
 */
export function CampusAccountScreen() {
  const t = useT();
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
      setMessage({ tone: 'up', text: t('app.campus.signInOk') });
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
      setMessage({ tone: 'up', text: t('app.campus.testOk', { balance: r.balance?.toFixed(2) ?? '—' }) });
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
      <SheetScreen title={t('app.campus.title')} primary={t('app.campus.test')} onPrimary={test} loading={busy} danger={t('app.campus.signOut')} onDanger={async () => {
        haptics.warning();
        await signOut();
        setMessage(null);
      }}>
        <ListGroup>
          <ListRow icon="person" title={account.name ?? account.username ?? t('app.ui.signedIn')} subtitle={[account.name ? account.username : null, account.signedInAt ? t('app.campus.signedInAt', { time: formatDateTime(new Date(account.signedInAt)) }) : null].filter(Boolean).join(' · ')} accessory={<Chip label={t('app.ui.signedIn')} tone="up" icon="check" />} />
        </ListGroup>
        <Text variant="callout" tone="muted">
          {t('app.campus.signedInNote')}
        </Text>
        {message ? <Status message={message} /> : null}
      </SheetScreen>
    );
  }

  return (
    <SheetScreen title={t('app.campus.signInTitle')} primary={t('app.campus.signIn')} onPrimary={login} loading={busy} primaryDisabled={!username.trim() || !password} secondary={t('core.common.cancel')} onSecondary={() => dismiss('/settings')}>
      <Text variant="callout" tone="muted">
        {t('app.campus.intro')}
      </Text>
      <Field label={t('app.campus.username')} value={username} onChangeText={setUsername} autoCapitalize="none" keyboardType="number-pad" autoFocus />
      <SecretField label={t('app.campus.password')} value={password} onChangeText={setPassword} textContentType="password" autoComplete="password" />
      <Text variant="caption" tone="faint">
        {t('app.campus.factorHint')}
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
  const t = useT();
  return (
    <Surface level={2}>
      <View className="gap-1">
        <Text variant="callout" tone={message.tone}>
          {message.text}
        </Text>
        {message.tone === 'down' && message.network ? (
          <Text variant="caption" tone="muted">
            {t('app.campus.networkHint')}
          </Text>
        ) : null}
      </View>
    </Surface>
  );
}

