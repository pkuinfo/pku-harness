import { router } from 'expo-router';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import type { TabSlot } from '@/core/runtime/types';

import { PluginScreenHost } from './screen-host';

const TITLE: Record<TabSlot, string> = { dashboard: '看板', schedule: '日程' };

/**
 * A harness tab slot. The first enabled plugin that contributes this slot renders it; without
 * one, the tab explains how to get it. The harness ships no tab content of its own.
 */
export function TabSlotHost({ slot }: { slot: TabSlot }) {
  const plugins = usePlugins();
  usePluginSettings('__any__'); // re-render when plugin settings change
  const owner = plugins
    .filter((p) => pluginSettings.get(p.id).enabled && !registry.unavailable(p.id))
    .flatMap((p) => (p.contributes?.tabs ?? []).filter((t) => t.slot === slot).map((t) => ({ plugin: p, tab: t })))[0];
  if (!owner) {
    return (
      <Screen title={TITLE[slot]}>
        <EmptyState
          icon="puzzle"
          title="这个位置由插件提供"
          message="开启或安装一个提供此页面的插件。"
          action={<Button title="管理插件" size="sm" variant="secondary" onPress={() => router.push('/plugins')} />}
        />
      </Screen>
    );
  }
  return <PluginScreenHost pluginId={owner.plugin.id} screen={owner.tab.screen} params={{}} />;
}
