import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { FadeIn } from '@/components/fade-in';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { useAIConfig } from '@/core/agent/provider';
import { sessions } from '@/core/agent/session/sessions';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import type { ProviderModel } from '@/core/runtime/types';
import { spacing, useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { formatContextWindow, shortModelName } from './logic';
import { pickerProviders, providerModels } from './models';
import { applyModel, useSessionBusy, useSessionModel } from './session';

const CURVE = { borderCurve: 'continuous' } as const;

function close() {
  if (router.canGoBack()) router.back();
}

/**
 * Model / provider switcher (docs/AGENT-HARNESS.md §4.5), presented as a form sheet from the
 * composer's model pill and `/model`. Ready providers first, each with its models; picking one
 * applies to this session from the next request and becomes the default for new sessions.
 */
export function ModelPicker() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  useAIConfig();
  useSyncExternalStore(pluginSettings.subscribe, pluginSettings.snapshot);
  const current = useSessionModel();
  const busy = useSessionBusy();
  const groups = pickerProviders();

  const select = async (providerId: string, model: ProviderModel) => {
    if (providerId === current.providerId && model.id === current.model) {
      close();
      return;
    }
    haptics.select();
    await applyModel(providerId, model.id);
    if (busy) sessions.notice(`下一条消息起使用 ${shortModelName(model.id, model.name)}`, 'info', { command: '/model' });
    close();
  };

  return (
    // Sized to its content (fitToContents sheet); the list scrolls once it outgrows the screen.
    <View className="bg-elevated">
      <View className="flex-row items-start gap-3 pb-3 pl-5 pr-3 pt-5">
        <View className="flex-1 gap-0.5">
          <Text variant="headline">选择模型</Text>
          <Text variant="caption" tone="muted">
            从下一条消息起用于这个对话，也会作为新对话的默认模型
          </Text>
        </View>
        <IconButton icon="close" label="关闭" variant="ghost" size={36} onPress={() => router.back()} />
      </View>
      <ScrollView style={{ flexGrow: 0 }} nestedScrollEnabled contentContainerClassName="gap-5 px-3" contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg }}>
        {groups.length === 0 ? (
          <View className="items-center gap-3 px-4 py-8">
            <Text variant="callout" tone="muted" align="center">
              还没有可用的 AI 服务插件
            </Text>
            <Button title="去设置" variant="secondary" size="sm" onPress={() => router.replace('/ai-settings')} />
          </View>
        ) : null}
        {groups.map(({ entry, ready }, gi) => {
          const models = providerModels(entry);
          return (
            <FadeIn key={entry.id} index={gi}>
              <View className="gap-1">
                <View className="flex-row items-center gap-2 px-2 pb-1">
                  <Text variant="micro" tone="faint" className="flex-1">
                    {entry.def.name}
                  </Text>
                  {ready ? null : (
                    <PressableScale accessibilityRole="button" accessibilityLabel={`去设置 ${entry.def.name}`} onPress={() => router.replace('/ai-settings')} hitSlop={8} className="flex-row items-center gap-0.5">
                      <Text variant="caption" tone="accent">
                        去设置
                      </Text>
                      <Icon name="chevronRight" size={12} color={c.accent} />
                    </PressableScale>
                  )}
                </View>
                {models.length === 0 ? (
                  <Text variant="caption" tone="faint" className="px-2 pb-2">
                    在 AI 服务设置里填写模型名称
                  </Text>
                ) : null}
                {models.map((m) => {
                  const selected = entry.id === current.providerId && m.id === current.model;
                  const window = formatContextWindow(m.contextWindow);
                  const images = m.inputModalities?.includes('image');
                  return (
                    <PressableScale
                      key={m.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: !ready }}
                      accessibilityLabel={`${m.name ?? m.id}${m.description ? `，${m.description}` : ''}${window ? `，上下文 ${window}` : ''}${images ? '，支持图片' : ''}`}
                      disabled={!ready}
                      haptic={false}
                      onPress={() => void select(entry.id, m)}
                      className={cx('flex-row items-center gap-3 rounded-md px-3 py-2.5', selected ? 'bg-accent-muted' : 'bg-surface-2', !ready && 'opacity-40')}
                      style={CURVE}>
                      <View className="flex-1 gap-1">
                        <View className="flex-row flex-wrap items-center gap-1.5">
                          <Text variant="bodyStrong" numberOfLines={1}>
                            {m.name ?? m.id}
                          </Text>
                          {window ? <Chip label={window} /> : null}
                          {images ? <Chip label="图片" tone="info" icon="image" /> : null}
                        </View>
                        {m.description ? (
                          <Text variant="caption" tone="muted" numberOfLines={2}>
                            {m.description}
                          </Text>
                        ) : null}
                      </View>
                      <View className="size-6 items-center justify-center">{selected ? <Icon name="check" size={18} color={c.accent} /> : null}</View>
                    </PressableScale>
                  );
                })}
              </View>
            </FadeIn>
          );
        })}
      </ScrollView>
    </View>
  );
}
