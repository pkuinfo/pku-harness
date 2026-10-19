import { router } from 'expo-router';
import { Alert, Share, View } from 'react-native';

import { FadeIn } from '@/components/fade-in';
import { ListGroup, ListRow } from '@/components/list-group';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { useAIConfig } from '@/core/agent/provider';
import { useCampusAccount } from '@/core/campus/account';
import { exportData, resetData } from '@/core/data';
import type { IconName } from '@/components/icon';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { haptics } from '@/utils/haptics';
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
  const campus = useCampusAccount();
  const plugins = usePlugins();
  const pluginCount = plugins.length;
  // Settings rows contributed by enabled plugins (e.g. AI 记忆 from the memory plugin).
  const contributed = plugins
    .filter((p) => pluginSettings.get(p.id).enabled && !registry.unavailable(p.id))
    .flatMap((p) => (p.contributes?.settings ?? []).map((row) => ({ plugin: p, row })));
  return (
    <Screen title="设置" subtitle="Settings">
      <FadeIn index={0}>
        <ListGroup title="账号">
          <ListRow
            icon="person"
            title="校园账号"
            subtitle={campus.signedIn ? `${campus.username} · 已登录` : '未登录 · IAAA 统一身份认证'}
            onPress={() => router.push('/campus')}
          />
          <ListRow
            icon="sparkles"
            iconTint={c.accent}
            title="AI 服务"
            subtitle={ai.hasKey ? `${ai.config.name} · ${ai.config.model}` : '未连接 · 默认 DeepSeek'}
            onPress={() => router.push('/ai-settings')}
          />
        </ListGroup>
      </FadeIn>
      {contributed.length ? (
        <FadeIn index={1}>
          <ListGroup title="插件设置">
            {contributed.map(({ plugin, row }) => (
              <ListRow
                key={`${plugin.id}/${row.screen}`}
                icon={(row.icon as IconName | undefined) ?? (plugin.icon as IconName | undefined) ?? 'puzzle'}
                title={row.title}
                subtitle={row.subtitle}
                onPress={() =>
                  router.push({
                    pathname: plugin.contributes?.screens?.[row.screen]?.presentation === 'modal' ? '/m/[plugin]/[screen]' : '/p/[plugin]/[screen]',
                    params: { plugin: plugin.id, screen: row.screen },
                  })
                }
              />
            ))}
          </ListGroup>
        </FadeIn>
      ) : null}
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
      <FadeIn index={4}>
        <ListGroup title="数据" footer="所有数据只保存在这台手机上。导出内容不包含密码和 API Key。">
          <ListRow
            icon="send2"
            title="导出数据"
            subtitle="提醒、待办、课表、看板与设置（JSON）"
            onPress={async () => {
              const data = await exportData();
              await Share.share({ title: 'PKU Harness 数据', message: JSON.stringify(data, null, 2) });
            }}
          />
          <ListRow
            icon="trash"
            iconTint={c.down}
            title="清除所有数据"
            subtitle="删除本机上的全部数据和已保存的密钥"
            onPress={() =>
              Alert.alert('清除所有数据？', '提醒、待办、课表、看板、对话和已保存的密钥都会被删除，无法恢复。', [
                { text: '取消', style: 'cancel' },
                {
                  text: '清除',
                  style: 'destructive',
                  onPress: async () => {
                    await resetData();
                    haptics.success();
                  },
                },
              ])
            }
          />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
