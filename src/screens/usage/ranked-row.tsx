import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme';

/** One row of a ranked list: name, caption, value, and a thin share bar in the accent. */
export function RankedRow({ title, subtitle, value, detail, share, warn }: { title: string; subtitle?: string; value: string; detail?: string; share: number; warn?: boolean }) {
  const c = useTheme();
  const t = useT();
  return (
    <View className="gap-1.5" accessible accessibilityLabel={[title, subtitle, value, detail].filter(Boolean).join(t('app.ui.a11ySep'))}>
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <Text variant="callout" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="faint" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View className="items-end gap-0.5">
          <Text variant="callout" style={{ fontVariant: ['tabular-nums'] }}>
            {value}
          </Text>
          {detail ? (
            <View className="flex-row items-center gap-1">
              {warn ? <Icon name="warning" size={11} color={c.down} /> : null}
              <Text variant="caption" tone={warn ? 'down' : 'faint'} style={{ fontVariant: ['tabular-nums'] }}>
                {detail}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <View className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }} />
      </View>
    </View>
  );
}
