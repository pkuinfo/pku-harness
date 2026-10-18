import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { dismiss, SheetScreen } from '@/components/sheet-screen';
import { Text } from '@/components/text';
import { aiConfig, getModel, useAIConfig } from '@/core/agent/provider';
import { usePlugins } from '@/core/runtime/hooks';
import { usePluginSettings } from '@/core/runtime/plugin-settings';
import type { ProviderEntry } from '@/core/runtime/registry';
import type { ProviderModel } from '@/core/runtime/types';
import { radius, spacing, useTheme } from '@/theme';
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
      style={[
        styles.card,
        { backgroundColor: selected ? c.accentMuted : c.surface, borderColor: selected ? c.accent : 'transparent', opacity: enabled ? 1 : 0.5 },
      ]}>
      <View style={[styles.cardIcon, { backgroundColor: selected ? c.accent : c.surface3 }]}>
        <Icon name={icon} size={18} color={selected ? c.onAccent : c.text} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
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
  const c = useTheme();
  const { config, keys } = useAIConfig();
  const plugins = usePlugins();
  const providers = plugins.flatMap((p) => Object.entries(p.providers ?? {}).map(([k, def]) => ({ id: `${p.id}.${k}`, pluginId: p.id, def })));
  const [selectedId, setSelectedId] = useState(config.providerId);
  const entry = providers.find((p) => p.id === selectedId) ?? providers[0];
  const initial = aiConfig.settingsFor(entry.id);

  const [baseURL, setBaseURL] = useState(initial.baseURL);
  const [model, setModel] = useState(initial.model);
  const [credential, setCredential] = useState('');
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
    setCredential('');
    setListed(null);
    setStatus(null);
  };

  const models = mergeModels(entry.def.models, listed);

  const save = async () => {
    await aiConfig.save(entry.id, { baseURL: baseURL.trim(), model: model.trim() }, { credential: credential ? credential.trim() : undefined, activate: true });
    setCredential('');
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
        entry.def.listModels({ baseURL: baseURL.trim(), model, credential: cred }).then(setListed).catch(() => {});
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

      <View style={{ gap: spacing.sm }}>
        {providers.map((p) => (
          <ProviderCard key={p.id} entry={p} selected={p.id === entry.id} onPress={() => select(p.id)} />
        ))}
      </View>

      <Animated.View key={entry.id} entering={FadeIn} layout={LinearTransition} style={{ gap: spacing.lg }}>
        {models.length ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="callout" tone="muted">
              模型
            </Text>
            <View style={styles.models}>
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
                  style={[styles.model, { borderColor: model === m.id ? c.accent : c.border, backgroundColor: model === m.id ? c.accentMuted : c.surface2 }]}>
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
          <View style={{ gap: spacing.sm }}>
            <Field
              label="API Key"
              value={credential}
              onChangeText={setCredential}
              placeholder={hasKey ? '已保存（留空则不修改）' : 'sk-…'}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              hint={entry.def.credentialHint}
            />
            {hasKey ? <Chip label="已保存 API Key" tone="up" icon="lock" /> : null}
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
          <Animated.View entering={FadeIn} style={[styles.status, { backgroundColor: status.tone === 'up' ? c.upMuted : c.downMuted }]}>
            <Text variant="callout" tone={status.tone}>
              {status.text}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </SheetScreen>
  );
}

/** Catalog first (with names), then live-listed ids not in the catalog. */
function mergeModels(catalog: ProviderModel[], listed: ProviderModel[] | null): ProviderModel[] {
  if (!listed?.length) return catalog;
  const known = new Set(catalog.map((m) => m.id));
  return [...catalog, ...listed.filter((m) => !known.has(m.id)).slice(0, 12)];
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  cardIcon: { width: 36, height: 36, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  models: { gap: spacing.sm },
  model: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: spacing.xxs,
  },
  status: { padding: spacing.md, borderRadius: radius.md },
});
