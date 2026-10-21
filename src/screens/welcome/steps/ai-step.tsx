import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { IconButton } from '@/components/button';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { aiConfig, DEFAULT_PROVIDER, useAIConfig } from '@/core/agent/provider';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import type { ProviderEntry } from '@/core/runtime/registry';
import type { ProviderModel } from '@/core/runtime/types';
import { useT } from '@/i18n';
import { useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { describeVerifyError, hintLink, mergeModels } from './ai-helpers';
import { verifyProvider } from './ai-verify';
import { StepShell } from './step-shell';

type Status = { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok'; listed: ProviderModel[] | null } | { kind: 'error'; text: string };

/** Providers a first run can set up with a key (account sign-ins live in Settings). */
function useKeyProviders(): ProviderEntry[] {
  const plugins = usePlugins();
  return plugins
    .filter((p) => !p.remote)
    .flatMap((p) => Object.entries(p.providers ?? {}).map(([k, def]) => ({ id: `${p.id}.${k}`, pluginId: p.id, def })))
    .filter((e) => e.def.auth === 'apiKey' || e.def.auth === 'none');
}

/** Step 1 · Connect an AI provider: provider, key (validated by listing models), model. */
export function AIStep({ onDone, onSkip, onBack }: { onDone: () => void; onSkip: () => void; onBack: () => void }) {
  const t = useT();
  const c = useTheme();
  const providers = useKeyProviders();
  const { config, keys } = useAIConfig();
  const [selectedId, setSelectedId] = useState(() => (providers.some((p) => p.id === config.providerId) ? config.providerId : DEFAULT_PROVIDER));
  const entry = providers.find((p) => p.id === selectedId) ?? providers[0];
  const [baseURL, setBaseURL] = useState(() => (entry ? aiConfig.settingsFor(entry.id).baseURL : ''));
  const [model, setModel] = useState(() => (entry ? aiConfig.settingsFor(entry.id).model : ''));
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // A key already saved for this provider (re-running setup) counts as connected.
  useEffect(() => {
    if (!entry) return;
    let live = true;
    void aiConfig.credential(entry.id).then((k) => {
      if (!live) return;
      setSavedKey(k ?? null);
      setKey(k ?? '');
      if (k && keys[entry.id]) setStatus({ kind: 'ok', listed: null });
    });
    return () => {
      live = false;
    };
    // Only when the provider changes; `keys` updating after our own save must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  if (!entry) {
    return (
      <StepShell step="ai" icon="sparkles" title={t('welcome.ai.title')} why={t('welcome.ai.noProvider')} primary={t('welcome.step.continue')} onPrimary={onSkip} onBack={onBack} />
    );
  }

  const def = entry.def;
  const needsKey = def.auth === 'apiKey' && !def.editableBaseURL;
  const models = mergeModels(def.models, status.kind === 'ok' ? status.listed : null);
  const ok = status.kind === 'ok';

  const select = (id: string) => {
    if (id === selectedId) return;
    haptics.select();
    const s = aiConfig.settingsFor(id);
    setSelectedId(id);
    setBaseURL(s.baseURL);
    setModel(s.model);
    setKey('');
    setSavedKey(null);
    setStatus({ kind: 'idle' });
  };

  const editKey = (v: string) => {
    setKey(v);
    if (status.kind !== 'checking') setStatus(v.trim() && v.trim() === savedKey && keys[entry.id] ? { kind: 'ok', listed: null } : { kind: 'idle' });
  };

  const paste = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (!text) return;
    haptics.select();
    editKey(text);
  };

  const verify = async () => {
    const credential = key.trim() || undefined;
    setStatus({ kind: 'checking' });
    try {
      // The provider plugin may have been switched off earlier; connecting it turns it on.
      if (!pluginSettings.get(entry.pluginId).enabled) await pluginSettings.update(entry.pluginId, { enabled: true });
      const listed = await verifyProvider(entry, baseURL.trim(), model.trim(), credential);
      const chosen = model.trim() || def.defaultModel || listed[0]?.id || '';
      setModel(chosen);
      await aiConfig.save(entry.id, { baseURL: baseURL.trim(), model: chosen }, { credential: (credential ?? '') === (savedKey ?? '') ? undefined : (credential ?? ''), activate: true });
      setSavedKey(credential ?? null);
      setStatus({ kind: 'ok', listed });
      haptics.success();
    } catch (e) {
      setStatus({ kind: 'error', text: describeVerifyError(e, t) });
      haptics.warning();
    }
  };

  const proceed = async () => {
    await aiConfig.save(entry.id, { baseURL: baseURL.trim(), model: model.trim() }, { activate: true });
    onDone();
  };

  const link = hintLink(def.credentialHint);
  const canVerify = (!needsKey || !!key.trim()) && (!def.editableBaseURL || !!baseURL.trim());

  return (
    <StepShell
      step="ai"
      icon="sparkles"
      title={t('welcome.ai.title')}
      why={t('welcome.ai.why')}
      primary={ok ? t('welcome.step.continue') : t('welcome.ai.verify')}
      onPrimary={ok ? proceed : verify}
      primaryLoading={status.kind === 'checking'}
      primaryDisabled={ok ? !model.trim() : !canVerify}
      onSkip={onSkip}
      onBack={onBack}>
      {providers.length > 1 ? <Segmented options={providers.map((p) => ({ label: p.def.name, value: p.id }))} value={entry.id} onChange={select} /> : null}

      <Animated.View key={entry.id} entering={FadeIn} layout={LinearTransition} className="gap-4">
        {def.editableBaseURL ? (
          <Field label={t('welcome.ai.baseURL')} value={baseURL} onChangeText={setBaseURL} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…/v1" />
        ) : null}

        {def.auth === 'apiKey' ? (
          <View className="gap-1">
            <Field
              label={t('welcome.ai.apiKey')}
              value={key}
              onChangeText={editKey}
              placeholder="sk-…"
              secureTextEntry={!shown}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              onSubmitEditing={canVerify && !ok ? verify : undefined}
              returnKeyType="done"
              trailing={
                <View className="flex-row">
                  <IconButton icon="copy" label={t('welcome.ai.paste')} variant="ghost" size={40} onPress={paste} />
                  <IconButton icon={shown ? 'eyeOff' : 'eye'} label={shown ? t('welcome.ai.hide') : t('welcome.ai.show')} variant="ghost" size={40} onPress={() => setShown((s) => !s)} />
                </View>
              }
            />
            {link ? (
              <Text variant="caption" tone="faint">
                {link.before}
                <Text variant="caption" tone="accent" accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`https://${link.domain}`)}>
                  {link.domain}
                </Text>
                {link.after}
              </Text>
            ) : def.credentialHint ? (
              <Text variant="caption" tone="faint">
                {def.credentialHint}
              </Text>
            ) : null}
          </View>
        ) : null}

        <StatusLine status={status} />

        {ok && models.length ? (
          <Animated.View entering={FadeIn} className="gap-2">
            <Text variant="callout" tone="muted">
              {t('welcome.ai.model')}
            </Text>
            {models.map((m) => {
              const on = model === m.id;
              return (
                <PressableScale
                  key={m.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={m.name ?? m.id}
                  onPress={() => {
                    haptics.select();
                    setModel(m.id);
                  }}
                  className={cx('flex-row items-center gap-3 rounded-md border px-4 py-3', on ? 'border-accent bg-accent-muted' : 'border-edge bg-surface-2')}
                  style={{ borderCurve: 'continuous' }}>
                  <View className="flex-1 gap-0.5">
                    <Text variant="callout" tone={on ? 'accent' : 'default'}>
                      {m.name ?? m.id}
                    </Text>
                    {m.description ? (
                      <Text variant="caption" tone="muted">
                        {m.description}
                      </Text>
                    ) : null}
                  </View>
                  {on ? <Icon name="check" size={18} color={c.accent} /> : null}
                </PressableScale>
              );
            })}
          </Animated.View>
        ) : null}

        {ok && !models.length ? <Field label={t('welcome.ai.modelId')} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} placeholder={t('welcome.ai.modelIdPlaceholder')} /> : null}
      </Animated.View>
    </StepShell>
  );
}

function StatusLine({ status }: { status: Status }) {
  const t = useT();
  const c = useTheme();
  if (status.kind === 'idle') return null;
  if (status.kind === 'checking') {
    return (
      <Text variant="callout" tone="muted">
        {t('welcome.ai.checking')}
      </Text>
    );
  }
  const good = status.kind === 'ok';
  const text = good ? (status.listed?.length ? t('welcome.ai.connectedModels', { count: status.listed.length }) : t('welcome.ai.connected')) : status.text;
  return (
    <Animated.View entering={FadeIn} className={cx('flex-row items-center gap-2 rounded-md p-3', good ? 'bg-up-muted' : 'bg-down-muted')} style={{ borderCurve: 'continuous' }} accessibilityLiveRegion="polite">
      <Icon name={good ? 'check' : 'warning'} size={16} color={good ? c.up : c.down} />
      <Text variant="callout" tone={good ? 'up' : 'down'} className="flex-1">
        {text}
      </Text>
    </Animated.View>
  );
}
