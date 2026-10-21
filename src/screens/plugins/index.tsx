import { router } from 'expo-router';

import { Chip } from '@/components/chip';
import { FadeIn } from '@/components/fade-in';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeSwitch } from '@/components/native-switch';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { usePlugins } from '@/core/runtime/hooks';
import { registry } from '@/core/runtime/registry';
import { pluginName } from '@/core/runtime/localize';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import type { PluginDef } from '@/core/runtime/types';
import { useLocale, useT } from '@/i18n';
import { haptics } from '@/utils/haptics';

import { effectInfo, effectsOf, pluginIcon } from './effects';

function PluginRow({ plugin }: { plugin: PluginDef }) {
  const t = useT();
  const name = pluginName(plugin, useLocale());
  const settings = usePluginSettings(plugin.id);
  const why = registry.unavailable(plugin.id);
  const toolCount = Object.keys(plugin.tools).length;
  const effects = effectsOf(plugin);
  const sep = t('app.ui.listSep');
  const ask = effects.filter((e) => settings.modes[e] === 'ask').map((e) => effectInfo(e, t).label);
  const off = effects.filter((e) => settings.modes[e] === 'off').map((e) => effectInfo(e, t).label);
  const notes = [
    ask.length ? t('app.plugins.needsConfirm', { list: ask.join(sep) }) : '',
    off.length ? t('app.plugins.blocked', { list: off.join(sep) }) : '',
  ].filter(Boolean);
  return (
    <ListRow
      icon={pluginIcon(plugin)}
      title={name}
      subtitle={
        why
          ? why
          : settings.enabled
          ? [
              toolCount
                ? t('app.plugins.tools', { count: toolCount })
                : plugin.providers
                  ? t('app.plugins.providers', { count: Object.keys(plugin.providers).length })
                  : t('app.plugins.providesUI'),
              ...notes,
            ].join(' · ')
          : t('app.plugins.off')
      }
      onPress={() => router.push({ pathname: '/plugins/[id]', params: { id: plugin.id } })}
      chevron={plugin.core}
      accessory={
        plugin.core ? (
          <Chip label={t('app.plugins.builtin')} />
        ) : (
          <NativeSwitch
            label={t('app.plugins.enable', { name })}
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
  const t = useT();
  const plugins = usePlugins();
  const core = plugins.filter((p) => p.core);
  const ai = plugins.filter((p) => !p.core && !p.remote && p.providers);
  const services = plugins.filter((p) => !p.core && !p.remote && !p.providers);
  const remote = plugins.filter((p) => p.remote);
  return (
    <Screen title={t('app.plugins.title')} subtitle={t('app.plugins.eyebrow')} back>
      <FadeIn index={0}>
        <Text variant="callout" tone="muted">
          {t('app.plugins.intro')}
        </Text>
      </FadeIn>
      {services.length ? (
        <FadeIn index={1}>
          <ListGroup title={t('app.plugins.services')}>
            {services.map((p) => (
              <PluginRow key={p.id} plugin={p} />
            ))}
          </ListGroup>
        </FadeIn>
      ) : null}
      {ai.length ? (
        <FadeIn index={2}>
          <ListGroup title={t('app.plugins.ai')} footer={t('app.plugins.aiFooter')}>
            {ai.map((p) => (
              <PluginRow key={p.id} plugin={p} />
            ))}
          </ListGroup>
        </FadeIn>
      ) : null}
      <FadeIn index={2}>
        <ListGroup title={t('app.plugins.core')} footer={t('app.plugins.coreFooter')}>
          {core.map((p) => (
            <PluginRow key={p.id} plugin={p} />
          ))}
        </ListGroup>
      </FadeIn>
      <FadeIn index={3}>
        <ListGroup title={t('app.plugins.remote')} footer={t('app.plugins.remoteFooter')}>
          {remote.map((p) => (
            <PluginRow key={p.id} plugin={p} />
          ))}
          <ListRow icon="plus" title={t('app.plugins.add')} subtitle={t('app.plugins.addSubtitle')} onPress={() => router.push('/plugins/add')} />
          <ListRow icon="store" title={t('app.plugins.market')} subtitle={t('app.plugins.marketSubtitle')} onPress={() => router.push('/plugins/market')} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
