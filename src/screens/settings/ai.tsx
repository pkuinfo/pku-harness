import { fetch as expoFetch } from 'expo/fetch';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Field, SecretField } from '@/components/field';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Segmented } from '@/components/segmented';
import { dismiss, SheetScreen } from '@/components/sheet-screen';
import { Text } from '@/components/text';
import { invalidateBalance } from '@/core/agent/balance';
import { CONTEXT_BUDGET_OPTIONS, setContextBudgetSetting, useContextBudgetSetting } from '@/core/agent/context/compaction';
import { aiConfig, getModel, useAIConfig } from '@/core/agent/provider';
import { usePlugins } from '@/core/runtime/hooks';
import { modelText, providerText } from '@/core/runtime/localize';
import { usePluginSettings } from '@/core/runtime/plugin-settings';
import type { ProviderEntry } from '@/core/runtime/registry';
import type { ProviderModel } from '@/core/runtime/types';
import { useLocale, useT } from '@/i18n';
import { useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { AccountBalance } from './ai-balance';

function ProviderCard({ entry, selected, onPress }: { entry: ProviderEntry; selected: boolean; onPress: () => void }) {
  const c = useTheme();
  const t = useT();
  const { config } = useAIConfig();
  const enabled = usePluginSettings(entry.pluginId).enabled;
  const active = config.providerId === entry.id;
  const icon = (usePlugins().find((p) => p.id === entry.pluginId)?.icon ?? 'sparkles') as IconName;
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !enabled }}
      accessibilityLabel={entry.def.name}
      onPress={onPress}
      disabled={!enabled}
      className={cx(
        'flex-row items-center gap-3 rounded-lg border p-3',
        selected ? 'border-accent bg-accent-muted' : 'border-transparent bg-surface',
        enabled ? 'opacity-100' : 'opacity-50',
      )}
      style={{ borderCurve: 'continuous' }}>
      <View
        className={cx('h-9 w-9 items-center justify-center rounded-md', selected ? 'bg-accent' : 'bg-surface-3')}
        style={{ borderCurve: 'continuous' }}>
        <Icon name={icon} size={18} color={selected ? c.onAccent : c.text} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong">{entry.def.name}</Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {enabled ? entry.def.description : t('app.ai.pluginOff')}
        </Text>
      </View>
      {active ? <Chip label={t('app.ai.active')} tone="up" icon="check" /> : null}
    </PressableScale>
  );
}

/** Settings → AI 服务: pick a provider plugin, model, endpoint and credential; test it. */
export function AISettings() {
  const t = useT();
  const { config, keys } = useAIConfig();
  const plugins = usePlugins();
  // Names, key hints and model blurbs through the plugin's i18n overlay (re-renders on a language change).
  const locale = useLocale();
  const providers = plugins.flatMap((p) =>
    Object.entries(p.providers ?? {}).map(([k, def]) => {
      const models = def.models.map((m) => ({ ...m, ...modelText(p, k, m, locale) }));
      return { id: `${p.id}.${k}`, pluginId: p.id, def: { ...def, ...providerText(p, k, def, locale), models } };
    }),
  );
  const [selectedId, setSelectedId] = useState(config.providerId);
  const entry = providers.find((p) => p.id === selectedId) ?? providers[0];
  const initial = aiConfig.settingsFor(entry.id);

  const [baseURL, setBaseURL] = useState(initial.baseURL);
  const [model, setModel] = useState(initial.model);
  // The saved key is loaded into the field (masked; the eye reveals it). Saving writes it only
  // when it changed, so an untouched field never clears or rewrites the stored key.
  const [credential, setCredential] = useState('');
  const [savedCredential, setSavedCredential] = useState('');
  useEffect(() => {
    let live = true;
    void aiConfig.credential(entry.id).then((k) => {
      if (!live) return;
      setSavedCredential(k ?? '');
      setCredential(k ?? '');
    });
    return () => {
      live = false;
    };
  }, [entry.id]);
  const [listed, setListed] = useState<ProviderModel[] | null>(null);
  const [status, setStatus] = useState<{ tone: 'up' | 'down'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const hasKey = !!keys[entry.id];

  const select = (id: string) => {
    haptics.select();
    const s = aiConfig.settingsFor(id);
    setSelectedId(id);
    setBaseURL(s.baseURL);
    setModel(s.model);
    setListed(null);
    setStatus(null);
  };

  const models = mergeModels(entry.def.models, listed);

  const save = async () => {
    const next = credential.trim();
    const changed = next !== savedCredential;
    await aiConfig.save(entry.id, { baseURL: baseURL.trim(), model: model.trim() }, { credential: changed ? next : undefined, activate: true });
    // A new key may belong to another account: drop the cached balance so it's read again.
    if (changed) invalidateBalance(entry.id);
    setSavedCredential(next);
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await save();
      const { generateText } = await import('ai');
      const r = await generateText({ model: await getModel(entry.id), prompt: t('app.ai.testPrompt') });
      setStatus({ tone: 'up', text: t('app.ai.testOk', { reply: r.text.slice(0, 40) }) });
      haptics.success();
      if (entry.def.listModels) {
        const cred = (await aiConfig.credential(entry.id)) ?? undefined;
        entry.def.listModels({ baseURL: baseURL.trim(), model, credential: cred, fetch: expoFetch as unknown as typeof fetch }).then(setListed).catch(() => {});
      }
    } catch (e) {
      setStatus({ tone: 'down', text: e instanceof Error ? e.message : String(e) });
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  const needsKey = entry.def.auth === 'apiKey';
  const canTest = !!model.trim() && (!needsKey || hasKey || !!credential || !!entry.def.editableBaseURL);

  return (
    <SheetScreen
      title={t('app.ai.title')}
      primary={t('app.ai.saveAndTest')}
      onPrimary={test}
      loading={busy}
      primaryDisabled={!canTest}
      secondary={t('app.ai.saveOnly')}
      onSecondary={async () => {
        await save();
        haptics.success();
        dismiss('/settings');
      }}>
      <Text variant="callout" tone="muted">
        {t('app.ai.intro')}
      </Text>

      <View className="gap-2">
        {providers.map((p) => (
          <ProviderCard key={p.id} entry={p} selected={p.id === entry.id} onPress={() => select(p.id)} />
        ))}
      </View>

      <Animated.View key={entry.id} entering={FadeIn} layout={LinearTransition} className="gap-4">
        <AccountBalance providerId={entry.id} />

        {models.length ? (
          <View className="gap-2">
            <Text variant="callout" tone="muted">
              {t('app.ai.models')}
            </Text>
            <View className="gap-2">
              {models.map((m) => (
                <PressableScale
                  key={m.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: model === m.id }}
                  accessibilityLabel={m.name ?? m.id}
                  onPress={() => {
                    haptics.select();
                    setModel(m.id);
                  }}
                  className={cx(
                    'gap-0.5 rounded-md border px-4 py-3',
                    model === m.id ? 'border-accent bg-accent-muted' : 'border-edge bg-surface-2',
                  )}
                  style={{ borderCurve: 'continuous' }}>
                  <Text variant="callout" tone={model === m.id ? 'accent' : 'default'}>
                    {m.name ?? m.id}
                  </Text>
                  {m.description ? (
                    <Text variant="caption" tone="muted">
                      {m.description}
                    </Text>
                  ) : null}
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}

        <Field label={t('app.ai.modelId')} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} placeholder={t('app.ai.modelIdPlaceholder')} />
        {entry.def.editableBaseURL ? (
          <Field label="Base URL" value={baseURL} onChangeText={setBaseURL} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        ) : (
          <Text variant="caption" tone="faint">
            {t('app.ai.endpoint', { url: baseURL })}
          </Text>
        )}

        {entry.def.auth === 'apiKey' ? (
          <View className="gap-2">
            <SecretField label="API Key" value={credential} onChangeText={setCredential} placeholder="sk-…" hint={entry.def.credentialHint} />
            {hasKey ? <Chip label={credential.trim() === savedCredential ? t('app.ai.keySaved') : t('app.ai.keyChanged')} tone={credential.trim() === savedCredential ? 'up' : 'warn'} icon="lock" /> : null}
          </View>
        ) : null}

        {entry.def.auth === 'account' ? (
          <Button
            title={hasKey ? t('app.ai.signInAgain') : t('app.ai.signIn', { name: entry.def.name })}
            variant="secondary"
            icon="person"
            onPress={async () => {
              try {
                const token = await entry.def.signIn?.();
                if (token) await aiConfig.save(entry.id, {}, { credential: token, activate: true });
              } catch (e) {
                setStatus({ tone: 'down', text: e instanceof Error ? e.message : String(e) });
              }
            }}
          />
        ) : null}

        {status ? (
          <Animated.View entering={FadeIn} className={cx('rounded-md p-3', status.tone === 'up' ? 'bg-up-muted' : 'bg-down-muted')}>
            <Text variant="callout" tone={status.tone}>
              {status.text}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>

      <ContextBudget />
    </SheetScreen>
  );
}

/** 上下文预算 (docs/AGENT-HARNESS.md §5.3): older turns are summarised above it. Saved on change. */
function ContextBudget() {
  const t = useT();
  const budget = useContextBudgetSetting();
  const options = CONTEXT_BUDGET_OPTIONS.map((o) => ({ label: o.label, value: o.label }));
  const current = CONTEXT_BUDGET_OPTIONS.find((o) => o.value === budget)?.label ?? '128k';
  return (
    <View className="gap-2">
      <Text variant="callout" tone="muted">
        {t('app.ai.budget')}
      </Text>
      <Segmented
        options={options}
        value={current}
        onChange={(label) => {
          const next = CONTEXT_BUDGET_OPTIONS.find((o) => o.label === label);
          if (next) void setContextBudgetSetting(next.value);
        }}
      />
      <Text variant="caption" tone="faint">
        {t('app.ai.budgetHint')}
      </Text>
    </View>
  );
}

/** Catalog first (with names), then live-listed ids not in the catalog. */
function mergeModels(catalog: ProviderModel[], listed: ProviderModel[] | null): ProviderModel[] {
  if (!listed?.length) return catalog;
  const known = new Set(catalog.map((m) => m.id));
  return [...catalog, ...listed.filter((m) => !known.has(m.id)).slice(0, 12)];
}
