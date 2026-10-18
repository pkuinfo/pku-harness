import { Switch } from 'react-native';

import { ListGroup, ListRow } from '@/components/list-group';
import { Screen } from '@/components/screen';
import { setThemePreference, useTheme, useThemePreference } from '@/theme';

/** Settings tab: account, AI provider, plugins, preferences (docs/ARCHITECTURE.md §2). */
export function Settings() {
  const c = useTheme();
  const pref = useThemePreference();
  return (
    <Screen title="设置" subtitle="Settings">
      <ListGroup title="账号">
        <ListRow icon="person" title="校园账号" subtitle="未登录 · IAAA 统一身份认证" onPress={() => {}} />
        <ListRow icon="sparkles" iconTint={c.accent} title="AI 服务" subtitle="自带 API Key 或使用官方服务" onPress={() => {}} />
      </ListGroup>
      <ListGroup title="插件与权限" footer="授权后，AI 可直接代你操作对应服务。">
        <ListRow icon="puzzle" title="已安装插件" value="0" onPress={() => {}} />
      </ListGroup>
      <ListGroup title="偏好">
        <ListRow icon="bell" title="通知" onPress={() => {}} />
        <ListRow
          icon="palette"
          title="深色模式"
          accessory={
            <Switch
              value={pref !== 'light'}
              onValueChange={(v) => setThemePreference(v ? 'dark' : 'light')}
              trackColor={{ true: c.accent, false: c.surface3 }}
            />
          }
          chevron={false}
        />
      </ListGroup>
    </Screen>
  );
}
