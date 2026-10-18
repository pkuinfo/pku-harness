import { router } from 'expo-router';
import { View } from 'react-native';

import { FadeIn } from '@/components/fade-in';
import { ListGroup, ListRow } from '@/components/list-group';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { useAIConfig } from '@/core/agent/provider';
import { registry } from '@/core/runtime/registry';
import { setThemePreference, spacing, useTheme, useThemePreference, type ThemePreference } from '@/theme';

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: '跟随系统', value: 'system' },
  { label: '深色', value: 'dark' },
  { label: '浅色', value: 'light' },
];

/** Settings tab: account, AI provider, plugins, preferences (docs/ARCHITECTURE.md §2). */
export function Settings() {
  const c = useTheme();
  const pref = useThemePreference();
  const ai = useAIConfig();
  const pluginCount = registry.list().length;
  return (
    <Screen title="设置" subtitle="Settings">
      <FadeIn index={0}>
        <ListGroup title="账号">
          <ListRow icon="person" title="校园账号" subtitle="未登录 · IAAA 统一身份认证" onPress={() => router.push('/plugins')} />
          <ListRow
            icon="sparkles"
            iconTint={c.accent}
            title="AI 服务"
            subtitle={ai.hasKey ? `${ai.config.name} · ${ai.config.model}` : '未连接 · 默认 DeepSeek'}
            onPress={() => router.push('/ai-settings')}
          />
        </ListGroup>
      </FadeIn>
      <FadeIn index={1}>
        <ListGroup title="插件与权限" footer="授权后，AI 可直接代你操作对应服务；可在每个插件里单独调整。">
          <ListRow icon="puzzle" title="插件" value={`${pluginCount} 个`} onPress={() => router.push('/plugins')} />
        </ListGroup>
      </FadeIn>
      <FadeIn index={2}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="micro" tone="faint" style={{ paddingHorizontal: spacing.lg }}>
            外观
          </Text>
          <Segmented options={THEME_OPTIONS} value={pref} onChange={setThemePreference} />
        </View>
      </FadeIn>
      <FadeIn index={3}>
        <ListGroup title="通知">
          <ListRow icon="bell" title="提醒与通知" subtitle="精确提醒、后台检查" onPress={() => router.push('/notifications')} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
