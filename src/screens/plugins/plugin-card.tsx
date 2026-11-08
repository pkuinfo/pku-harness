import { router } from 'expo-router';
import { View } from 'react-native';

import type { ChipTone } from '@/components/chip';
import { Icon } from '@/components/icon';
import { NativeSwitch } from '@/components/native-switch';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { pluginName } from '@/core/runtime/localize';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { useLocale, useT } from '@/i18n';
import { useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { PluginTile } from './plugin-tile';
import { STATUS_LABEL, STATUS_TONE } from './status';
import { StatusDot } from './status-dot';
import type { PluginEntry } from './use-plugin-status';

/** Compact plugin row. The switch is a sibling of the details link, so toggles never navigate. */
export function PluginCard({ entry, width }: { entry: PluginEntry; tone: ChipTone; width: number; index: number }) {
  const c = useTheme();
  const t = useT();
  const { plugin, status, enabled } = entry;
  const name = pluginName(plugin, useLocale());
  const label = t(STATUS_LABEL[status]);
  const toggleable = !plugin.core && status !== 'unavailable';
  const muted = status === 'off' || status === 'unavailable';

  return (
    <View className="min-h-16 flex-row items-center gap-3 border-b border-edge" style={{ width }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('app.plugins.cardLabel', { name, status: label })}
        className="min-h-16 flex-1 flex-row items-center gap-3 py-3"
        onPress={() => router.push({ pathname: '/plugins/[id]', params: { id: plugin.id } })}>
        <PluginTile plugin={plugin} tone="neutral" muted={muted} />
        <View className="flex-1 gap-1">
          <Text variant="callout" tone={muted ? 'muted' : 'default'} numberOfLines={2}>{name}</Text>
          <View className="flex-row items-center gap-1.5">
            <StatusDot tone={STATUS_TONE[status]} />
            <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">{label}</Text>
          </View>
        </View>
        <Icon name="chevronRight" size={14} color={c.textFaint} />
      </PressableScale>
      {toggleable ? (
        <NativeSwitch label={t('app.plugins.enable', { name })} value={enabled} onValueChange={(value) => {
          haptics.tap();
          void pluginSettings.update(plugin.id, { enabled: value });
        }} />
      ) : (
        <View className="w-12 items-center" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={plugin.core ? 'lock' : 'warning'} size={14} color={c.textFaint} />
        </View>
      )}
    </View>
  );
}
