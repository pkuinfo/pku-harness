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
import { CONTEXT_BUDGET_OPTIONS, setContextBudgetSetting, useContextBudgetSetting } from '@/core/agent/context/compaction';
import { aiConfig, getModel, useAIConfig } from '@/core/agent/provider';
import { usePlugins } from '@/core/runtime/hooks';
import { usePluginSettings } from '@/core/runtime/plugin-settings';
import type { ProviderEntry } from '@/core/runtime/registry';
import type { ProviderModel } from '@/core/runtime/types';
import { useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

function ProviderCard({ entry, selected, onPress }: { entry: ProviderEntry; selected: boolean; onPress: () => void }) {
  const c = useTheme();
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
          {enabled ? entry.def.description : '插件已关闭'}
        </Text>
      </View>
      {active ? <Chip label="使用中" tone="up" icon="check" /> : null}
    </PressableScale>
  );
}

/** Settings → AI 服务: pick a provider plugin, model, endpoint and credential; test it. */
export function AISettings() {
  const { config, keys } = useAIConfig();
  const plugins = usePlugins();
  const providers = plugins.flatMap((p) => Object.entries(p.providers ?? {}).map(([k, def]) => ({ id: `${p.id}.${k}`, pluginId: p.id, def })));
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
    await aiConfig.save(entry.id, { baseURL: baseURL.trim(), model: model.trim() }, { credential: next === savedCredential ? undefined : next, activate: true });
    setSavedCredential(next);
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await save();
      const { generateText } = await import('ai');
      const r = await generateText({ model: await getModel(entry.id), prompt: '只回复：好的' });
      setStatus({ tone: 'up', text: `连接成功：${r.text.slice(0, 40)}` });
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
      title="AI 服务"
      primary="保存并测试连接"
      onPrimary={test}
      loading={busy}
      primaryDisabled={!canTest}
      secondary="仅保存"
      onSecondary={async () => {
        await save();
        haptics.success();
        dismiss('/settings');
      }}>
      <Text variant="callout" tone="muted">
        AI 服务也是插件。密钥只保存在本机的安全存储中，只会发送给你选择的服务商。
      </Text>

      <View className="gap-2">
        {providers.map((p) => (
          <ProviderCard key={p.id} entry={p} selected={p.id === entry.id} onPress={() => select(p.id)} />
        ))}
      </View>

      <Animated.View key={entry.id} entering={FadeIn} layout={LinearTransition} className="gap-4">
        {models.length ? (
          <View className="gap-2">
            <Text variant="callout" tone="muted">
              模型
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

        <Field label="模型 ID" value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} placeholder="例如 gpt-4o-mini" />
        {entry.def.editableBaseURL ? (
          <Field label="Base URL" value={baseURL} onChangeText={setBaseURL} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        ) : (
          <Text variant="caption" tone="faint">
            接口地址：{baseURL}
          </Text>
        )}

        {entry.def.auth === 'apiKey' ? (
          <View className="gap-2">
            <SecretField label="API Key" value={credential} onChangeText={setCredential} placeholder="sk-…" hint={entry.def.credentialHint} />
            {hasKey ? <Chip label={credential.trim() === savedCredential ? '已保存在本机安全存储' : '有改动，保存后生效'} tone={credential.trim() === savedCredential ? 'up' : 'warn'} icon="lock" /> : null}
          </View>
        ) : null}

        {entry.def.auth === 'account' ? (
          <Button
            title={hasKey ? '已登录 · 重新登录' : `登录 ${entry.def.name}`}
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
  const budget = useContextBudgetSetting();
  const options = CONTEXT_BUDGET_OPTIONS.map((o) => ({ label: o.label, value: o.label }));
  const current = CONTEXT_BUDGET_OPTIONS.find((o) => o.value === budget)?.label ?? '64k';
  return (
    <View className="gap-2">
      <Text variant="callout" tone="muted">
        上下文预算
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
        对话超过预算（或模型上下文的 80%）时，会自动把较早的内容压缩成摘要。预算越小回复越快、越省。
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
