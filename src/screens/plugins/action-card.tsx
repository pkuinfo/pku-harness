import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { duration, springs, useTheme } from '@/theme';

/** A grid tile that leads somewhere (add a remote plugin, marketplace): outlined, not filled, so it reads as an action. */
export function ActionCard({ icon, title, subtitle, width, onPress }: { icon: IconName; title: string; subtitle: string; width: number; onPress: () => void }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const layout = reduced ? undefined : LinearTransition.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness);
  return (
    <Animated.View layout={layout} entering={FadeIn.duration(duration.base)} style={{ width }}>
      <PressableScale accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} onPress={onPress} style={{ flex: 1 }}>
        <View className="flex-1 gap-3 rounded-lg border border-dashed border-edge p-3" style={{ borderCurve: 'continuous' }}>
          <View className="h-10 w-10 items-center justify-center rounded-md bg-surface-2" style={{ borderCurve: 'continuous' }}>
            <Icon name={icon} size={20} color={c.textMuted} />
          </View>
          <View className="gap-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {title}
            </Text>
            <Text variant="caption" tone="faint" numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
