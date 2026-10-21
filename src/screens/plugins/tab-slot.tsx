import { router } from 'expo-router';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import type { TabSlot } from '@/core/runtime/types';
import { useT } from '@/i18n';

import { PluginScreenHost } from './screen-host';

/**
 * A harness tab slot. The first enabled plugin that contributes this slot renders it; without
 * one, the tab explains how to get it. The harness ships no tab content of its own.
 */
export function TabSlotHost({ slot }: { slot: TabSlot }) {
  const t = useT();
  const plugins = usePlugins();
  usePluginSettings('__any__'); // re-render when plugin settings change
  const owner = plugins
    .filter((p) => pluginSettings.get(p.id).enabled && !registry.unavailable(p.id))
    .flatMap((p) => (p.contributes?.tabs ?? []).filter((t) => t.slot === slot).map((t) => ({ plugin: p, tab: t })))[0];
  if (!owner) {
    return (
      <Screen title={t(`app.tabs.${slot}`)}>
        <EmptyState
          icon="puzzle"
          title={t('app.plugins.slot.title')}
          message={t('app.plugins.slot.message')}
          action={<Button title={t('app.plugins.slot.manage')} size="sm" variant="secondary" onPress={() => router.push('/plugins')} />}
        />
      </Screen>
    );
  }
  return <PluginScreenHost pluginId={owner.plugin.id} screen={owner.tab.screen} params={{}} />;
}
