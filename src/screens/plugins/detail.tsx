import { View } from 'react-native';

import { router } from 'expo-router';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/fade-in';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeSwitch } from '@/components/native-switch';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { usePlugin } from '@/core/runtime/hooks';
import { pluginDescription, pluginName, toolTitle } from '@/core/runtime/localize';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import { remotePlugins } from '@/core/runtime/remote';
import { useLocale, useT } from '@/i18n';
import { useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { effectInfo, effectsOf, modeOptions, pluginIcon } from './effects';

/** Settings → 插件 → one plugin: on/off, per-effect modes, scopes, and its tools. */
export function PluginDetail({ id }: { id: string }) {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const plugin = usePlugin(id);
  const settings = usePluginSettings(id);
  if (!plugin) {
    return (
      <Screen title={t('app.plugins.title')} back>
        <EmptyState icon="puzzle" title={t('app.plugins.detail.notFound')} message={t('app.plugins.detail.notFoundMessage', { id })} />
      </Screen>
    );
  }
  const effects = effectsOf(plugin);
  const tools = Object.entries(plugin.tools);

  return (
    <Screen title={pluginName(plugin, locale)} subtitle={`${plugin.id} · v${plugin.version}`} back>
      <FadeIn index={0}>
        <View className="flex-row items-center gap-4">
          <View className="h-[52px] w-[52px] items-center justify-center rounded-lg bg-accent-muted" style={{ borderCurve: 'continuous' }}>
            <Icon name={pluginIcon(plugin)} size={26} color={c.accent} />
          </View>
          <Text variant="callout" tone="muted" className="flex-1">
            {pluginDescription(plugin, locale)}
          </Text>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <ListGroup footer={plugin.core ? undefined : t('app.plugins.detail.offFooter')}>
          <ListRow
            icon="bolt"
            title={plugin.core ? t('app.plugins.detail.coreTitle') : t('app.plugins.detail.enable')}
            subtitle={plugin.core ? t('app.plugins.detail.coreSubtitle') : undefined}
            accessory={
              plugin.core ? (
                <Chip label={t('app.ui.enabled')} tone="up" icon="check" />
              ) : (
                <NativeSwitch
                  label={t('app.plugins.detail.enable')}
                  value={settings.enabled}
                  onValueChange={(v) => {
                    haptics.tap();
                    pluginSettings.update(id, { enabled: v });
                  }}
                />
              )
            }
          />
        </ListGroup>
      </FadeIn>

      {effects.length && settings.enabled ? (
        <FadeIn index={2}>
          <View className="gap-2">
            <Text variant="micro" tone="faint" className="px-4">
              {t('app.plugins.detail.whenAgent')}
            </Text>
            <View className="overflow-hidden rounded-lg bg-surface" style={{ borderCurve: 'continuous' }}>
              {effects.map((e, i) => (
                <View key={e} className={cx('gap-3 p-4', i > 0 && 'border-t-[0.5px] border-edge')}>
                  <View className="flex-row items-center gap-2">
                    <Chip label={effectInfo(e, t).label} tone={effectInfo(e, t).tone} />
                    <Text variant="caption" tone="muted" className="flex-1">
                      {effectInfo(e, t).hint}
                    </Text>
                  </View>
                  <Segmented
                    options={modeOptions(t)}
                    value={settings.modes[e]}
                    onChange={(m) => pluginSettings.update(id, { modes: { ...settings.modes, [e]: m } })}
                  />
                </View>
              ))}
            </View>
            <Text variant="caption" tone="faint" className="px-4">
              {t('app.plugins.detail.tapNote')}
            </Text>
          </View>
        </FadeIn>
      ) : null}

      {plugin.scopes.length && !plugin.remote ? (
        <FadeIn index={3}>
          <ListGroup title={t('app.plugins.detail.scopes')}>
            {plugin.scopes.map((s) => (
              <ListRow key={s} icon="globe" title={s} />
            ))}
          </ListGroup>
        </FadeIn>
      ) : null}

      {plugin.remote ? (
        <FadeIn index={3}>
          <ListGroup title={t('app.plugins.detail.remote')} footer={t('app.plugins.detail.remoteFooter')}>
            <ListRow icon="server" title={plugin.remote.server} subtitle={plugin.remote.url} />
            <ListRow
              icon="refresh"
              title={t('app.plugins.detail.refresh')}
              onPress={async () => {
                await remotePlugins.refresh(plugin.id).catch(() => haptics.warning());
                haptics.success();
              }}
            />
          </ListGroup>
        </FadeIn>
      ) : null}

      <FadeIn index={4}>
        <ListGroup title={t('app.plugins.detail.tools', { count: tools.length })}>
          {tools.map(([name, tool]) => (
            <ListRow
              key={name}
              title={toolTitle(plugin, name, tool.title, locale)}
              subtitle={`${plugin.id}.${name}`}
              accessory={<Chip label={effectInfo(tool.effect, t).label} tone={effectInfo(tool.effect, t).tone} />}
            />
          ))}
        </ListGroup>
      </FadeIn>

      {plugin.remote ? (
        <FadeIn index={5}>
          <Button
            title={t('app.plugins.detail.remove')}
            variant="danger"
            icon="trash"
            onPress={async () => {
              haptics.warning();
              await remotePlugins.uninstall(plugin.id);
              router.back();
            }}
          />
        </FadeIn>
      ) : null}
    </Screen>
  );
}
