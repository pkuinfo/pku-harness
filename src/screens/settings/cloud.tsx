import type { MetaResponse } from '@pku-harness/cloud-protocol';
import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { GlassEdges } from '@/components/glass';
import { Icon, type IconName } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { PressableScale } from '@/components/pressable-scale';
import { SheetScreen } from '@/components/sheet-screen';
import { Text } from '@/components/text';
import { OFFICIAL_URL, checkBaseURL, displayHost, type ProviderMode } from '@/core/cloud/config';
import { cloudProvider, fetchMeta, useCloudProvider } from '@/core/cloud/provider';
import { deleteCloudData, registerNow, resetCloudIdentity, useCloudDevice } from '@/core/cloud/runtime';
import { useT } from '@/i18n';
import { radius, useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

const CURVE = { borderCurve: 'continuous' } as const;

const MODES: { mode: ProviderMode; icon: IconName; title: 'app.cloud.providerOff' | 'app.cloud.providerOfficial' | 'app.cloud.providerCustom'; hint: 'app.cloud.providerOffHint' | 'app.cloud.providerOfficialHint' | 'app.cloud.providerCustomHint' }[] = [
  { mode: 'off', icon: 'close', title: 'app.cloud.providerOff', hint: 'app.cloud.providerOffHint' },
  { mode: 'official', icon: 'shield', title: 'app.cloud.providerOfficial', hint: 'app.cloud.providerOfficialHint' },
  { mode: 'custom', icon: 'server', title: 'app.cloud.providerCustom', hint: 'app.cloud.providerCustomHint' },
];

function ModeCard({ icon, title, hint, selected, active, onPress }: { icon: IconName; title: string; hint: string; selected: boolean; active: boolean; onPress: () => void }) {
  const c = useTheme();
  const t = useT();
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      className={cx('flex-row items-center gap-3 rounded-lg border p-3', selected ? 'border-accent bg-accent-muted' : 'border-transparent bg-surface')}
      style={CURVE}>
      <View className={cx('h-9 w-9 items-center justify-center rounded-md', selected ? 'bg-accent' : 'bg-surface-3')} style={CURVE}>
        <Icon name={icon} size={18} color={selected ? c.onAccent : c.text} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {hint}
        </Text>
      </View>
      {active ? <Chip label={t('app.cloud.active')} tone="up" icon="check" /> : null}
    </PressableScale>
  );
}

/** What the server says about itself (/v1/meta): operator, services, limits. */
function ServerCard({ meta, host }: { meta: MetaResponse; host: string }) {
  const t = useT();
  const ch = meta.limits.channels;
  return (
    <Animated.View entering={FadeIn} className="gap-3 rounded-lg bg-surface p-4" style={CURVE}>
      <GlassEdges radius={radius.lg} />
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text variant="micro" tone="faint">
            {t('app.cloud.operator').toUpperCase()}
          </Text>
          <Text variant="headline" numberOfLines={2}>
            {meta.operator.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {host}
            {meta.operator.contact ? ` · ${meta.operator.contact}` : ''}
          </Text>
        </View>
        <Chip label={`v${meta.protocol}`} />
      </View>
      <View className="gap-1.5">
        <Text variant="micro" tone="faint">
          {t('app.cloud.services').toUpperCase()}
        </Text>
        <View className="flex-row flex-wrap gap-1">
          {meta.services.map((s) => (
            <Chip key={s} label={t(`app.cloud.serviceNames.${s}`)} tone="info" />
          ))}
        </View>
      </View>
      <View className="gap-0.5">
        <Text variant="micro" tone="faint">
          {t('app.cloud.limits').toUpperCase()}
        </Text>
        {meta.services.includes('channels') ? (
          <Text variant="callout" tone="muted">
            {t('app.cloud.limitChannels', { count: ch.maxOpen, hours: Math.round(ch.maxTtlS / 3600) })}
          </Text>
        ) : null}
        {meta.services.includes('store') ? (
          <Text variant="callout" tone="muted">
            {t('app.cloud.limitStore', { mb: Math.round(meta.limits.store.maxBytes / 100_000) / 10, keys: meta.limits.store.maxKeys })}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** Device identity: the fingerprint as the hero, registration status, reset and delete. */
function DeviceGroup() {
  const c = useTheme();
  const t = useT();
  const provider = useCloudProvider();
  const device = useCloudDevice();
  const [busy, setBusy] = useState<'reset' | 'delete' | null>(null);
  const configured = !!provider.baseURL;
  const host = displayHost(provider.baseURL);

  const status =
    device.state === 'registered'
      ? { label: t('app.cloud.registered'), tone: 'up' as const, icon: 'check' as const }
      : device.state === 'registering'
        ? { label: t('app.cloud.registering'), tone: 'info' as const, icon: 'sync' as const }
        : device.state === 'error'
          ? { label: t('app.cloud.registerFailed', { error: device.error ?? '' }), tone: 'down' as const, icon: 'warning' as const }
          : { label: t('app.cloud.notRegistered'), tone: 'neutral' as const, icon: undefined };

  const confirm = (kind: 'reset' | 'delete') =>
    Alert.alert(
      t(kind === 'reset' ? 'app.cloud.resetTitle' : 'app.cloud.deleteTitle'),
      kind === 'reset' ? t('app.cloud.resetMessage') : t('app.cloud.deleteMessage', { host }),
      [
        { text: t('core.common.cancel'), style: 'cancel' },
        {
          text: t(kind === 'reset' ? 'app.cloud.resetConfirm' : 'app.cloud.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            setBusy(kind);
            try {
              await (kind === 'reset' ? resetCloudIdentity() : deleteCloudData());
              haptics.success();
            } catch (e) {
              haptics.warning();
              Alert.alert(t(kind === 'reset' ? 'app.cloud.reset' : 'app.cloud.delete'), e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );

  return (
    <View className="gap-2">
      <Text variant="micro" tone="faint" className="px-4">
        {t('app.cloud.device').toUpperCase()}
      </Text>
      <View className="gap-2 rounded-lg bg-surface p-4" style={CURVE}>
        <GlassEdges radius={radius.lg} />
        <Text variant="caption" tone="faint">
          {t('app.cloud.fingerprint')}
        </Text>
        {device.fingerprint ? (
          <Text variant="numberM" selectable accessibilityLabel={`${t('app.cloud.fingerprint')} ${device.fingerprint}`}>
            {device.fingerprint}
          </Text>
        ) : (
          <Text variant="callout" tone="muted">
            {t('app.cloud.fingerprintNone')}
          </Text>
        )}
        {configured ? (
          <View className="flex-row items-center gap-2">
            <Chip label={status.label} tone={status.tone} icon={status.icon} className="shrink" />
            {device.state === 'error' || device.state === 'none' ? (
              <PressableScale accessibilityRole="button" accessibilityLabel={t('app.cloud.retry')} onPress={() => void registerNow().catch(() => haptics.warning())} hitSlop={8}>
                <Text variant="callout" tone="accent">
                  {t('app.cloud.retry')}
                </Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}
      </View>
      {device.fingerprint || configured ? (
        <ListGroup footer={t('app.cloud.deviceFooter')}>
          <ListRow
            icon="refresh"
            title={t('app.cloud.reset')}
            subtitle={t('app.cloud.resetSubtitle')}
            onPress={busy ? undefined : () => confirm('reset')}
            chevron={false}
            accessory={busy === 'reset' ? <ActivityIndicator color={c.textMuted} /> : undefined}
          />
          {configured ? (
            <ListRow
              icon="trash"
              iconTint={c.down}
              title={t('app.cloud.delete')}
              subtitle={t('app.cloud.deleteSubtitle')}
              onPress={busy ? undefined : () => confirm('delete')}
              chevron={false}
              accessory={busy === 'delete' ? <ActivityIndicator color={c.textMuted} /> : undefined}
            />
          ) : null}
        </ListGroup>
      ) : null}
    </View>
  );
}

/**
 * Settings → 云服务 (docs/CLOUD.md §2.4): pick off / official / a self-hosted URL, save and test
 * (the server's /v1/meta: operator, services, limits), and manage this device's identity.
 */
export function CloudSettings() {
  const c = useTheme();
  const t = useT();
  const provider = useCloudProvider();
  const [mode, setMode] = useState<ProviderMode>(provider.config.mode);
  const [url, setURL] = useState(provider.config.customURL ?? '');
  const [urlError, setURLError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ meta: MetaResponse; host: string } | { error: string } | null>(null);

  const urlMessage = (input: string) => {
    const r = checkBaseURL(input, { dev: __DEV__ });
    return r.ok ? undefined : t(`app.cloud.urlErrors.${r.reason}`);
  };

  // The saved provider's cached meta shows until a new test replaces it.
  const savedMeta = mode === provider.config.mode && provider.baseURL && provider.meta ? { meta: provider.meta, host: displayHost(provider.baseURL) } : null;
  const shown = result ?? savedMeta;

  const save = async () => {
    if (mode === 'custom') {
      const err = urlMessage(url);
      setURLError(err);
      if (err) {
        haptics.warning();
        return;
      }
    }
    setBusy(true);
    setResult(null);
    try {
      const customURL = mode === 'custom' ? url.trim() : provider.config.customURL;
      await cloudProvider.save({ mode, customURL });
      if (mode !== 'off') {
        const base = mode === 'official' ? OFFICIAL_URL : (checkBaseURL(url, { dev: __DEV__ }) as { url: string }).url;
        const meta = await fetchMeta(base);
        await cloudProvider.refreshMeta().catch(() => {});
        setResult({ meta, host: displayHost(base) });
      }
      haptics.success();
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScreen title={t('app.cloud.title')} primary={mode === 'off' ? t('app.cloud.save') : t('app.cloud.saveAndTest')} onPrimary={save} loading={busy}>
      <Text variant="callout" tone="muted">
        {t('app.cloud.intro')}
      </Text>

      <View className="gap-2" accessibilityRole="radiogroup">
        {MODES.map((m) => (
          <ModeCard
            key={m.mode}
            icon={m.icon}
            title={t(m.title)}
            hint={m.mode === 'official' ? `${t(m.hint)} · ${displayHost(OFFICIAL_URL)}` : t(m.hint)}
            selected={mode === m.mode}
            active={provider.config.mode === m.mode}
            onPress={() => {
              haptics.select();
              setMode(m.mode);
              setResult(null);
            }}
          />
        ))}
      </View>

      <Animated.View layout={LinearTransition} className="gap-4">
        {mode === 'custom' ? (
          <Animated.View entering={FadeIn}>
            <Field
              label={t('app.cloud.baseURL')}
              value={url}
              onChangeText={(v) => {
                setURL(v);
                if (urlError) setURLError(urlMessage(v));
              }}
              onBlur={() => url.trim() && setURLError(urlMessage(url))}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://"
              hint={__DEV__ ? t('app.cloud.baseURLHintDev') : t('app.cloud.baseURLHint')}
              error={urlError}
            />
          </Animated.View>
        ) : null}

        {mode !== 'off' && shown ? (
          'error' in shown ? (
            <Animated.View entering={FadeIn} className="flex-row gap-2 rounded-md bg-down-muted p-3" style={CURVE}>
              <Icon name="warning" size={18} color={c.down} />
              <Text variant="callout" tone="down" className="flex-1">
                {shown.error}
              </Text>
            </Animated.View>
          ) : (
            <ServerCard meta={shown.meta} host={shown.host} />
          )
        ) : null}

        <DeviceGroup />
      </Animated.View>
    </SheetScreen>
  );
}
