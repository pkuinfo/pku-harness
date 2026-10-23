import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { GlassEdges } from '@/components/glass';
import { FadeIn as Enter } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeSwitch } from '@/components/native-switch';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { usePlugin } from '@/core/runtime/hooks';
import { pluginDescription, pluginName, screenTitle, settingsRowText, toolTitle, widgetText } from '@/core/runtime/localize';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { remotePlugins } from '@/core/runtime/remote';
import type { PluginDef } from '@/core/runtime/types';
import { useLocale, useT } from '@/i18n';
import { radius, springs, useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { effectInfo, effectsOf, modeOptions } from './effects';
import { PluginTile } from './plugin-tile';
import { GROUP_TONE, STATUS_LABEL, STATUS_TONE, groupOf, isRunning } from './status';
import { usePluginStatus } from './use-plugin-status';

const CURVE = { borderCurve: 'continuous' } as const;
/** Tab slots a plugin can fill → their routes (Expo Router tabs). */
const TAB_ROUTE = { dashboard: '/dashboard', schedule: '/schedule' } as const;

/** Open one of a plugin's contributed screens at its route (push or modal). */
function openScreen(plugin: PluginDef, screen: string) {
  router.push({
    pathname: plugin.contributes?.screens?.[screen]?.presentation === 'modal' ? '/m/[plugin]/[screen]' : '/p/[plugin]/[screen]',
    params: { plugin: plugin.id, screen },
  });
}

/** A section whose rows are revealed on demand (long tool lists). */
function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const turn = useSharedValue(0);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    turn.set(reduced ? (next ? 180 : 0) : withSpring(next ? 180 : 0, springs.snappy));
  };
  return (
    <View className="gap-2">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={open ? t('app.plugins.detail.collapse') : t('app.plugins.detail.expand')}
        accessibilityState={{ expanded: open }}
        scaleTo={0.985}
        onPress={toggle}>
        <View className="flex-row items-center justify-between px-4 py-1">
          <Text variant="micro" tone="faint">
            {title.toUpperCase()}
          </Text>
          <Animated.View style={chevron}>
            <Icon name="chevronDown" size={16} color={c.textFaint} />
          </Animated.View>
        </View>
      </PressableScale>
      {open ? <Animated.View entering={FadeIn}>{children}</Animated.View> : null}
    </View>
  );
}

/**
 * Settings → Plugins → one plugin: everything about it on one page. Header (icon, name,
 * description, status, switch), its settings screens, what the AI may do with it, its tools,
 * widgets and the hosts it talks to, and for remote plugins refresh / remove.
 */
export function PluginDetail({ id }: { id: string }) {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const plugin = usePlugin(id);
  const settings = usePluginSettings(id);
  const status = usePluginStatus(plugin, settings.enabled);
  if (!plugin) {
    return (
      <Screen title={t('app.plugins.title')} back>
        <EmptyState icon="puzzle" title={t('app.plugins.detail.notFound')} message={t('app.plugins.detail.notFoundMessage', { id })} />
      </Screen>
    );
  }
  const name = pluginName(plugin, locale);
  const effects = effectsOf(plugin);
  const tools = Object.entries(plugin.tools);
  const widgets = Object.entries(plugin.contributes?.widgets ?? {});
  const settingsRows = plugin.contributes?.settings ?? [];
  const tabs = plugin.contributes?.tabs ?? [];
  const why = registry.unavailable(plugin.id);
  const live = isRunning(status) || status === 'signIn';
  const toggle = (v: boolean) => {
    haptics.tap();
    pluginSettings.update(id, { enabled: v });
  };

  return (
    <Screen title={name} subtitle={`${plugin.id} · v${plugin.version}`} back>
      <Enter index={0}>
        <View className="gap-4 rounded-xl bg-surface p-4" style={CURVE}>
          <GlassEdges radius={radius.xl} />
          <View className="flex-row items-start gap-4">
            <PluginTile plugin={plugin} tone={GROUP_TONE[groupOf(plugin)]} size="lg" muted={!live} />
            <View className="flex-1 gap-2">
              <Text variant="callout" tone="muted">
                {pluginDescription(plugin, locale)}
              </Text>
              <View className="flex-row flex-wrap gap-1">
                {/* System plugins are always on; the row below already says so. */}
                {plugin.core ? <Chip label={t('app.plugins.builtin')} icon="lock" /> : <Chip label={t(STATUS_LABEL[status])} tone={STATUS_TONE[status]} />}
                {plugin.remote ? <Chip label={t('app.plugins.marketplace.remoteMcp')} icon="server" /> : null}
              </View>
            </View>
          </View>
          <View className="h-[0.5px] bg-edge" />
          <View className="flex-row items-center gap-3">
            <View className="flex-1 gap-0.5">
              <Text variant="bodyStrong">{plugin.core ? t('app.plugins.detail.coreTitle') : t('app.plugins.detail.enable')}</Text>
              <Text variant="caption" tone="faint">
                {plugin.core ? t('app.plugins.detail.coreSubtitle') : t('app.plugins.detail.offFooter')}
              </Text>
            </View>
            {plugin.core ? (
              <Chip label={t('app.ui.enabled')} tone="up" icon="check" />
            ) : (
              <NativeSwitch label={t('app.plugins.enable', { name })} value={settings.enabled} disabled={!!why} onValueChange={toggle} />
            )}
          </View>
        </View>
      </Enter>

      {why ? (
        <Enter index={1}>
          <ListGroup>
            <ListRow icon="warning" iconTint={c.warn} title={t('app.plugins.status.unavailable')} subtitle={why} />
          </ListGroup>
        </Enter>
      ) : status === 'signIn' ? (
        <Enter index={1}>
          <ListGroup>
            <ListRow icon="person" iconTint={c.warn} title={t('app.plugins.detail.signIn')} subtitle={t('app.plugins.detail.signInSubtitle')} onPress={() => router.push('/campus')} />
          </ListGroup>
        </Enter>
      ) : null}

      {(settingsRows.length || tabs.length) && settings.enabled && !why ? (
        <Enter index={3}>
          <ListGroup title={t('app.plugins.detail.settings')}>
            {settingsRows.map((row) => {
              const text = settingsRowText(plugin, row.screen, row, locale);
              return (
                <ListRow
                  key={row.screen}
                  icon={(row.icon as IconName | undefined) ?? 'settings'}
                  title={text.title}
                  subtitle={text.subtitle}
                  onPress={() => openScreen(plugin, row.screen)}
                />
              );
            })}
            {tabs.map((tab) => (
              <ListRow
                key={`tab/${tab.slot}`}
                icon={tab.slot === 'dashboard' ? 'dashboard' : 'schedule'}
                title={screenTitle(plugin, tab.screen, plugin.contributes?.screens?.[tab.screen]?.title ?? tab.screen, locale)}
                subtitle={t('app.plugins.detail.tabSlot', { tab: t(`app.tabs.${tab.slot}`) })}
                onPress={() => router.navigate(TAB_ROUTE[tab.slot])}
              />
            ))}
          </ListGroup>
        </Enter>
      ) : null}

      {effects.length && settings.enabled && !why ? (
        <Enter index={4}>
          <View className="gap-2">
            <Text variant="micro" tone="faint" className="px-4">
              {t('app.plugins.detail.whenAgent').toUpperCase()}
            </Text>
            <View className="overflow-hidden rounded-lg bg-surface" style={CURVE}>
              {effects.map((e, i) => (
                <View key={e} className={cx('gap-3 p-4', i > 0 && 'border-t-[0.5px] border-edge')}>
                  <View className="flex-row items-center gap-2">
                    <Chip label={effectInfo(e, t).label} tone={effectInfo(e, t).tone} />
                    <Text variant="caption" tone="muted" className="flex-1">
                      {effectInfo(e, t).hint}
                    </Text>
                  </View>
                  <Segmented options={modeOptions(t)} value={settings.modes[e]} onChange={(m) => pluginSettings.update(id, { modes: { ...settings.modes, [e]: m } })} />
                </View>
              ))}
            </View>
            <Text variant="caption" tone="faint" className="px-4">
              {t('app.plugins.detail.tapNote')}
            </Text>
          </View>
        </Enter>
      ) : null}

      {widgets.length ? (
        <Enter index={5}>
          <ListGroup title={t('app.plugins.detail.widgets', { count: widgets.length })} footer={t('app.plugins.detail.widgetsFooter')}>
            {widgets.map(([key, w]) => {
              const text = widgetText(plugin, key, w, locale);
              return <ListRow key={key} icon="dashboard" title={text.title} subtitle={text.description} />;
            })}
          </ListGroup>
        </Enter>
      ) : null}

      {tools.length ? (
        <Enter index={6}>
          <Collapsible title={t('app.plugins.detail.tools', { count: tools.length })}>
            <ListGroup>
              {tools.map(([toolName, tool]) => (
                <ListRow
                  key={toolName}
                  title={toolTitle(plugin, toolName, tool.title, locale)}
                  subtitle={`${plugin.id}.${toolName}`}
                  accessory={<Chip label={effectInfo(tool.effect, t).label} tone={effectInfo(tool.effect, t).tone} />}
                />
              ))}
            </ListGroup>
          </Collapsible>
        </Enter>
      ) : null}

      {plugin.scopes.length && !plugin.remote ? (
        <Enter index={7}>
          <ListGroup title={t('app.plugins.detail.scopes')}>
            {plugin.scopes.map((s) => (
              <ListRow key={s} icon="globe" title={s} />
            ))}
          </ListGroup>
        </Enter>
      ) : null}

      {plugin.remote ? (
        <Enter index={8}>
          <View className="gap-4">
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
          </View>
        </Enter>
      ) : null}
    </Screen>
  );
}
