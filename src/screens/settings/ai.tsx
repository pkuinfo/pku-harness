import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { aiConfig, PRESETS, useAIConfig } from '@/core/agent/provider';
import { radius, spacing, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

/** Settings → AI 服务. DeepSeek is pre-filled; the user pastes their own API key. */
export function AISettings() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { config, hasKey } = useAIConfig();
  const [baseURL, setBaseURL] = useState(config.baseURL);
  const [model, setModel] = useState(config.model);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<{ tone: 'up' | 'down'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const preset = PRESETS.deepseek;

  const save = async () => {
    await aiConfig.save({ baseURL: baseURL.trim(), model: model.trim() }, apiKey ? apiKey.trim() : undefined);
    setApiKey('');
    haptics.success();
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      await save();
      const { generateText } = await import('ai');
      const { getModel } = await import('@/core/agent/provider');
      const r = await generateText({ model: await getModel(), prompt: '只回复：好的' });
      setStatus({ tone: 'up', text: `连接成功：${r.text.slice(0, 40)}` });
      haptics.success();
    } catch (e) {
      setStatus({ tone: 'down', text: e instanceof Error ? e.message : String(e) });
      haptics.warning();
    } finally {
      setTesting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.md }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text variant="title" style={{ flex: 1 }}>
            AI 服务
          </Text>
          <IconButton icon="close" label="关闭" variant="ghost" onPress={() => router.back()} />
        </View>
        <Text variant="callout" tone="muted">
          使用你自己的 API Key，密钥只保存在本机的安全存储中。默认使用 DeepSeek。
        </Text>

        <View style={{ gap: spacing.sm }}>
          <Text variant="callout" tone="muted">
            模型
          </Text>
          <View style={styles.models}>
            {preset.models.map((m) => (
              <PressableScale
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ selected: model === m }}
                accessibilityLabel={m}
                onPress={() => setModel(m)}
                style={[
                  styles.model,
                  { borderColor: model === m ? c.accent : c.border, backgroundColor: model === m ? c.accentMuted : c.surface2 },
                ]}>
                <Text variant="callout" tone={model === m ? 'accent' : 'default'}>
                  {m}
                </Text>
              </PressableScale>
            ))}
          </View>
        </View>

        <Field label="Base URL" value={baseURL} onChangeText={setBaseURL} autoCapitalize="none" autoCorrect={false} />
        <Field label="模型名称" value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} />
        <Field
          label="API Key"
          value={apiKey}
          onChangeText={setApiKey}
          placeholder={hasKey ? '已保存（留空则不修改）' : 'sk-…'}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          hint="在 platform.deepseek.com 的 API Keys 页面创建"
        />
        {hasKey ? <Chip label="已保存 API Key" tone="up" icon="lock" /> : null}

        {status ? (
          <View style={[styles.status, { backgroundColor: status.tone === 'up' ? c.upMuted : c.downMuted }]}>
            <Text variant="callout" tone={status.tone}>
              {status.text}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Button title="保存并测试连接" icon="sparkles" loading={testing} onPress={test} disabled={!hasKey && !apiKey} />
          <Button title="仅保存" variant="secondary" onPress={save} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center' },
  models: { flexDirection: 'row', gap: spacing.sm },
  model: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  status: { padding: spacing.md, borderRadius: radius.md },
});
