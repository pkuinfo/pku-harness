import { View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/** A quiet navigation row alongside the plugin list. */
export function ActionCard({ icon, title, subtitle, width, onPress }: { icon: IconName; title: string; subtitle: string; width: number; onPress: () => void }) {
  const c = useTheme();
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} onPress={onPress} className="min-h-16 flex-row items-center gap-3 border-b border-edge py-3" style={{ width }}>
      <View className="size-8 items-center justify-center"><Icon name={icon} size={18} color={c.textMuted} /></View>
      <View className="flex-1 gap-0.5">
        <Text variant="callout" numberOfLines={2}>{title}</Text>
        <Text variant="caption" tone="faint" numberOfLines={2}>{subtitle}</Text>
      </View>
      <Icon name="chevronRight" size={14} color={c.textFaint} />
    </PressableScale>
  );
}
