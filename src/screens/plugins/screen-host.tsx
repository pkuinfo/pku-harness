import { useMemo } from 'react';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { cloudFor } from '@/core/cloud/bind';
import { parkedShareLink } from '@/core/cloud/incoming';
import { hostUI } from '@/core/host-ui';
import { usePlugin } from '@/core/runtime/hooks';
import { pluginName, screenTitle } from '@/core/runtime/localize';
import { invokeTool, services } from '@/core/runtime/invoke';
import { usePluginSettings } from '@/core/runtime/plugin-settings';
import { kv } from '@/core/store/kv';
import { useLocale, useT } from '@/i18n';

/** Mounts a plugin-contributed screen with the host UI kit, services, its own store and its cloud client. */
export function PluginScreenHost({ pluginId, screen, params }: { pluginId: string; screen: string; params: Record<string, string | undefined> }) {
  const t = useT();
  const locale = useLocale();
  const plugin = usePlugin(pluginId);
  const settings = usePluginSettings(pluginId);
  const store = useMemo(() => kv(`plugin:${pluginId}`), [pluginId]);
  const invoke = useMemo(() => (tool: string, input?: Record<string, unknown>) => invokeTool(tool, input ?? {}, { actor: 'user' }), []);
  const contribution = plugin?.contributes?.screens?.[screen];
  // A person is driving a screen: missing cloud consent shows the consent sheet.
  const cloud = useMemo(() => (plugin?.cloud ? cloudFor(pluginId, { interactive: true }) : undefined), [plugin, pluginId]);
  // An opened share link arrives as an opaque handle (+native-intent); the viewer gets the link.
  const shared = parkedShareLink(params.share);
  const screenParams = useMemo(() => (shared ? { ...params, link: shared } : params), [params, shared]);

  if (!plugin || !contribution) {
    return (
      <Screen title={t('app.plugins.title')} back>
        <EmptyState icon="puzzle" title={t('app.plugins.screen.notFound')} message={`${pluginId}/${screen}`} />
      </Screen>
    );
  }
  if (!settings.enabled) {
    return (
      <Screen title={screenTitle(plugin, screen, contribution.title, locale)} back>
        <EmptyState icon="puzzle" title={t('app.plugins.screen.off')} message={t('app.plugins.screen.offMessage', { name: pluginName(plugin, locale) })} />
      </Screen>
    );
  }
  const Component = contribution.component;
  return <Component host={hostUI} services={services} kv={store} invoke={invoke} params={screenParams} cloud={cloud} />;
}
