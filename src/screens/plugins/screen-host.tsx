import { useMemo } from 'react';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { hostUI } from '@/core/host-ui';
import { usePlugin } from '@/core/runtime/hooks';
import { invokeTool, services } from '@/core/runtime/invoke';
import { usePluginSettings } from '@/core/runtime/plugin-settings';
import { kv } from '@/core/store/kv';

/** Mounts a plugin-contributed screen with the host UI kit, services and its own store. */
export function PluginScreenHost({ pluginId, screen, params }: { pluginId: string; screen: string; params: Record<string, string | undefined> }) {
  const plugin = usePlugin(pluginId);
  const settings = usePluginSettings(pluginId);
  const store = useMemo(() => kv(`plugin:${pluginId}`), [pluginId]);
  const invoke = useMemo(() => (tool: string, input?: Record<string, unknown>) => invokeTool(tool, input ?? {}, { actor: 'user' }), []);
  const contribution = plugin?.contributes?.screens?.[screen];

  if (!plugin || !contribution) {
    return (
      <Screen title="插件" back>
        <EmptyState icon="puzzle" title="找不到这个页面" message={`${pluginId}/${screen}`} />
      </Screen>
    );
  }
  if (!settings.enabled) {
    return (
      <Screen title={contribution.title} back>
        <EmptyState icon="puzzle" title="插件已关闭" message={`在 设置 → 插件 中开启「${plugin.name}」`} />
      </Screen>
    );
  }
  const Component = contribution.component;
  return <Component host={hostUI} services={services} kv={store} invoke={invoke} params={params} />;
}
