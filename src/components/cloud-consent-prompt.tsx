import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { displayHost } from '@/core/cloud/config';
import { cloudConsent, useCloudConsentRequest } from '@/core/cloud/consent';
import { disclosureLines } from '@/core/cloud/disclosure';
import { useCloudProvider } from '@/core/cloud/provider';
import { usePlugin } from '@/core/runtime/hooks';
import { pluginName } from '@/core/runtime/localize';
import { useLocale, useT } from '@/i18n';
import { shadows, spacing, springs, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Button } from './button';
import { Chip } from './chip';
import { Icon } from './icon';
import { Text } from './text';

const CURVE = { borderCurve: 'continuous' } as const;

/**
 * Cloud consent sheet (docs/CLOUD.md §2.5): slides up when a plugin a person is using needs the
 * cloud for the first time. Says which server, whether it's end-to-end encrypted, and exactly
 * what leaves the phone (the plugin's `disclosure`). Same pattern as the tool approval prompt;
 * mounted once in the root layout.
 */
export function CloudConsentPrompt() {
  const req = useCloudConsentRequest();
  if (!req) return null;
  return <Sheet key={req.id} id={req.id} pluginId={req.pluginId} />;
}

function Sheet({ id, pluginId }: { id: number; pluginId: string }) {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const plugin = usePlugin(pluginId);
  const provider = useCloudProvider();
  const manifest = plugin?.cloud;
  const name = plugin ? pluginName(plugin, locale) : pluginId;
  const lines = manifest ? disclosureLines(manifest, locale) : [];

  const answer = (allow: boolean) => {
    if (allow) haptics.success();
    else haptics.tap();
    void cloudConsent.answer(id, allow);
  };

  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      <Animated.View entering={FadeIn} exiting={FadeOut} className="absolute inset-0" style={{ backgroundColor: c.scrim }} />
      <Animated.View
        entering={SlideInDown.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness)}
        exiting={SlideOutDown}
        accessibilityViewIsModal
        className="absolute bottom-2 left-2 right-2 gap-3 rounded-xl bg-elevated p-4"
        style={{ borderCurve: 'continuous', paddingBottom: Math.max(insets.bottom, spacing.lg), boxShadow: shadows.overlay }}>
        <View className="flex-row items-center gap-3">
          <View className="size-10 items-center justify-center rounded-md bg-accent-muted" style={CURVE}>
            <Icon name="cloud" size={20} color={c.accent} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="micro" tone="faint">
              {t('app.cloud.consent.eyebrow')}
            </Text>
            <Text variant="headline" numberOfLines={2}>
              {t('app.cloud.consent.title', { name })}
            </Text>
          </View>
        </View>
        <View className="flex-row flex-wrap gap-1">
          <Chip label={t('app.cloud.consent.via', { host: displayHost(provider.baseURL) })} icon="server" />
          {manifest?.e2e ? <Chip label={t('app.cloud.consent.e2e')} tone="up" icon="lock" /> : null}
        </View>
        {lines.length ? (
          <View className="gap-1.5 rounded-md bg-surface-2 p-3" style={CURVE}>
            <Text variant="caption" tone="faint">
              {t('app.cloud.consent.leaves')}
            </Text>
            {lines.map((line) => (
              <View key={line} className="flex-row gap-2">
                <Text variant="callout" tone="faint">
                  ·
                </Text>
                <Text variant="callout" className="flex-1">
                  {line}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View className="flex-row gap-2">
          <Button title={t('app.cloud.consent.deny')} variant="secondary" onPress={() => answer(false)} className="flex-1" />
          <Button title={t('app.cloud.consent.allow')} onPress={() => answer(true)} className="flex-[2]" />
        </View>
        <Text variant="caption" tone="faint" className="self-center">
          {t('app.cloud.consent.footer')}
        </Text>
      </Animated.View>
    </View>
  );
}
