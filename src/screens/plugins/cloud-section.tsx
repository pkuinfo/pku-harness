import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeSwitch } from '@/components/native-switch';
import { displayHost } from '@/core/cloud/config';
import { setCloudGranted } from '@/core/cloud/consent';
import { disclosureLines } from '@/core/cloud/disclosure';
import { useCloudProvider } from '@/core/cloud/provider';
import { clearPluginCloudData } from '@/core/cloud/runtime';
import { pluginName } from '@/core/runtime/localize';
import { usePluginSettings } from '@/core/runtime/plugin-settings';
import type { PluginDef } from '@/core/runtime/types';
import { useLocale, useT } from '@/i18n';
import { useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

/**
 * Plugin page → 云端 (docs/CLOUD.md §2.5), only for plugins that declare `cloud`. One row says
 * where data goes (server host, E2E) with the allow switch; the footer lists exactly what leaves
 * the phone. Clearing the plugin's data appears once it's allowed.
 */
export function CloudSection({ plugin }: { plugin: PluginDef }) {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const provider = useCloudProvider();
  const settings = usePluginSettings(plugin.id);
  const [clearing, setClearing] = useState(false);
  const manifest = plugin.cloud;
  if (!manifest) return null;

  const name = pluginName(plugin, locale);
  const granted = !!settings.cloud?.granted;
  const host = displayHost(provider.baseURL);
  const configured = provider.config.mode !== 'off' && !!host;
  const missing = provider.meta ? manifest.uses.filter((s) => !provider.meta!.services.includes(s)) : [];
  const footer = disclosureLines(manifest, locale)
    .map((l) => `· ${l}`)
    .join('\n');

  const subtitle = !configured
    ? t('app.cloud.section.notConfigured')
    : missing.length
      ? t('app.cloud.section.unsupported', { list: missing.map((s) => t(`app.cloud.serviceNames.${s}`)).join(t('app.ui.listSep')) })
      : host;

  const clear = () =>
    Alert.alert(t('app.cloud.section.clearTitle', { name }), t('app.cloud.section.clearMessage'), [
      { text: t('core.common.cancel'), style: 'cancel' },
      {
        text: t('app.cloud.section.clearConfirm'),
        style: 'destructive',
        onPress: async () => {
          setClearing(true);
          try {
            await clearPluginCloudData(plugin.id);
            haptics.success();
          } catch (e) {
            haptics.warning();
            Alert.alert(t('app.cloud.section.clear'), e instanceof Error ? e.message : String(e));
          } finally {
            setClearing(false);
          }
        },
      },
    ]);

  return (
    <ListGroup title={t('app.cloud.section.title')} footer={footer}>
      <ListRow
        icon="cloud"
        iconTint={granted && configured ? c.accent : undefined}
        title={t('app.cloud.section.allow')}
        subtitle={subtitle}
        onPress={configured ? undefined : () => router.push('/cloud-settings')}
        chevron={!configured}
        accessory={
          <View className="flex-row items-center gap-2">
            <Chip label={manifest.e2e ? 'E2E' : t('app.cloud.section.notE2e')} tone={manifest.e2e ? 'up' : 'warn'} icon={manifest.e2e ? 'lock' : 'warning'} />
            {configured ? (
              <NativeSwitch
                label={t('app.cloud.section.a11y', { name })}
                value={granted}
                onValueChange={(v) => {
                  haptics.tap();
                  void setCloudGranted(plugin.id, v);
                }}
              />
            ) : null}
          </View>
        }
      />
      {granted && configured ? (
        <ListRow
          icon="trash"
          iconTint={c.down}
          title={t('app.cloud.section.clear')}
          onPress={clearing ? undefined : clear}
          chevron={false}
          accessory={clearing ? <ActivityIndicator color={c.textMuted} /> : undefined}
        />
      ) : null}
    </ListGroup>
  );
}
