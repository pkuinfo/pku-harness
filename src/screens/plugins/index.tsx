import { router } from 'expo-router';

import { Chip } from '@/components/chip';
import { FadeIn } from '@/components/fade-in';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeSwitch } from '@/components/native-switch';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { usePlugins } from '@/core/runtime/hooks';
import { registry } from '@/core/runtime/registry';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import type { PluginDef } from '@/core/runtime/types';
import { haptics } from '@/utils/haptics';

import { EFFECTS, effectsOf, pluginIcon } from './effects';

function PluginRow({ plugin }: { plugin: PluginDef }) {
  const settings = usePluginSettings(plugin.id);
  const why = registry.unavailable(plugin.id);
  const toolCount = Object.keys(plugin.tools).length;
  const effects = effectsOf(plugin);
  const ask = effects.filter((e) => settings.modes[e] === 'ask').map((e) => EFFECTS[e].label);
  const off = effects.filter((e) => settings.modes[e] === 'off').map((e) => EFFECTS[e].label);
  const notes = [ask.length ? `${ask.join('、')}需确认` : '', off.length ? `${off.join('、')}已禁止` : ''].filter(Boolean);
  return (
    <ListRow
      icon={pluginIcon(plugin)}
      title={plugin.name}
      subtitle={
        why
          ? why
          : settings.enabled
          ? [toolCount || !plugin.providers ? `${toolCount} 个能力` : `${Object.keys(plugin.providers).length} 个模型服务`, ...notes].join(' · ')
          : '已关闭，AI 无法使用'
      }
      onPress={() => router.push({ pathname: '/plugins/[id]', params: { id: plugin.id } })}
      chevron={plugin.core}
      accessory={
        plugin.core ? (
          <Chip label="内置" />
        ) : (
          <NativeSwitch
            label={`启用 ${plugin.name}`}
            value={settings.enabled}
            onValueChange={(v) => {
              haptics.tap();
              pluginSettings.update(plugin.id, { enabled: v });
            }}
          />
        )
      }
    />
  );
}

/** Settings → 插件: every registered plugin, on/off, and a way into its permissions. */
export function PluginsScreen() {
  const plugins = usePlugins();
  const core = plugins.filter((p) => p.core);
  const ai = plugins.filter((p) => !p.core && !p.remote && p.providers);
  const services = plugins.filter((p) => !p.core && !p.remote && !p.providers);
  const remote = plugins.filter((p) => p.remote);
  return (
    <Screen title="插件" subtitle="Plugins" back>
      <FadeIn index={0}>
        <Text variant="callout" tone="muted">
          每个校园服务都是一个插件。开启后，你和 AI 都能使用它的能力；在插件详情里可以为读取、修改、资金、公开操作分别设置是否需要确认。
        </Text>
      </FadeIn>
      {services.length ? (
        <FadeIn index={1}>
          <ListGroup title="校园服务">
            {services.map((p) => (
              <PluginRow key={p.id} plugin={p} />
            ))}
          </ListGroup>
        </FadeIn>
      ) : null}
      {ai.length ? (
        <FadeIn index={2}>
          <ListGroup title="AI 服务" footer="模型服务也是插件，可在 设置 → AI 服务 中切换。">
            {ai.map((p) => (
              <PluginRow key={p.id} plugin={p} />
            ))}
          </ListGroup>
        </FadeIn>
      ) : null}
      <FadeIn index={2}>
        <ListGroup title="系统能力" footer="系统能力是应用本身的一部分，始终开启。">
          {core.map((p) => (
            <PluginRow key={p.id} plugin={p} />
          ))}
        </ListGroup>
      </FadeIn>
      <FadeIn index={3}>
        <ListGroup title="远程插件" footer="远程插件通过 MCP 连接，不在本机运行第三方代码，也拿不到你的校园密码。">
          {remote.map((p) => (
            <PluginRow key={p.id} plugin={p} />
          ))}
          <ListRow icon="plus" title="添加远程插件" subtitle="输入 MCP 地址" onPress={() => router.push('/plugins/add')} />
          <ListRow icon="store" title="插件市场" subtitle="浏览社区插件，内置和远程平等" onPress={() => router.push('/plugins/market')} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
