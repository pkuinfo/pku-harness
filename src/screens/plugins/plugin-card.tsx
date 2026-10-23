import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import type { ChipTone } from '@/components/chip';
import { GlassEdges } from '@/components/glass';
import { Icon } from '@/components/icon';
import { NativeSwitch } from '@/components/native-switch';
import { Text } from '@/components/text';
import { pluginName } from '@/core/runtime/localize';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { useLocale, useT } from '@/i18n';
import { duration, pressScale, springs, stagger, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { PluginTile } from './plugin-tile';
import { STATUS_LABEL, STATUS_TONE } from './status';
import { StatusDot } from './status-dot';
import type { PluginEntry } from './use-plugin-status';

const CURVE = { borderCurve: 'continuous' } as const;

/**
 * One plugin in the plugins grid: tinted icon tile, name, one-line status with a state dot, and
 * its switch. The switch sits beside the pressable surface (not inside it), so toggling never
 * opens the plugin; the whole card still scales together on press.
 */
export function PluginCard({ entry, tone, width, index }: { entry: PluginEntry; tone: ChipTone; width: number; index: number }) {
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const { plugin, status, enabled } = entry;
  const name = pluginName(plugin, useLocale());
  const label = t(STATUS_LABEL[status]);
  const toggleable = !plugin.core && status !== 'unavailable';
  const muted = status === 'off' || status === 'unavailable';

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const layout = reduced ? undefined : LinearTransition.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness);
  const entering = FadeIn.duration(duration.base).delay(Math.min(index, stagger.maxItems) * stagger.step);

  return (
    <Animated.View layout={layout} entering={entering} exiting={FadeOut.duration(duration.fast)} style={{ width }}>
      <Animated.View className="flex-1" style={pressStyle}>
        <Pressable
          className="flex-1"
          accessibilityRole="button"
          accessibilityLabel={t('app.plugins.cardLabel', { name, status: label })}
          onPressIn={() => scale.set(withSpring(pressScale, springs.snappy))}
          onPressOut={() => scale.set(withSpring(1, springs.snappy))}
          onPress={() => {
            haptics.tap();
            router.push({ pathname: '/plugins/[id]', params: { id: plugin.id } });
          }}>
          <View className="flex-1 gap-3 rounded-lg bg-surface p-3" style={CURVE}>
            <GlassEdges />
            {/* Re-keyed on state so the tile cross-fades between tinted and grey. */}
            <Animated.View key={muted ? 'muted' : 'live'} entering={FadeIn.duration(duration.base)} className="self-start">
              <PluginTile plugin={plugin} tone={tone} muted={muted} />
            </Animated.View>
            <View className="gap-1">
              <Text variant="bodyStrong" tone={muted ? 'muted' : 'default'} numberOfLines={1}>
                {name}
              </Text>
              <Animated.View key={status} entering={FadeIn.duration(duration.base)} className="flex-row items-center gap-1.5">
                <StatusDot tone={STATUS_TONE[status]} />
                <Text variant="caption" tone="muted" numberOfLines={2} className="flex-1">
                  {label}
                </Text>
              </Animated.View>
            </View>
          </View>
        </Pressable>
        {toggleable ? (
          <View className="absolute right-2 top-2">
            <NativeSwitch
              label={t('app.plugins.enable', { name })}
              value={enabled}
              onValueChange={(v) => {
                haptics.tap();
                pluginSettings.update(plugin.id, { enabled: v });
              }}
            />
          </View>
        ) : (
          <View pointerEvents="none" className="absolute right-3 top-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name={plugin.core ? 'lock' : 'warning'} size={14} color={c.textFaint} />
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}
