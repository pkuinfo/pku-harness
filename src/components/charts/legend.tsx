import { View } from 'react-native';

import { Text } from '../text';

export type LegendItem = { color: string; label: string; value?: string };

/** Series key: a colour swatch beside text in text tokens (never coloured text). */
export function Legend({ items, columns = false }: { items: LegendItem[]; columns?: boolean }) {
  return (
    <View className={columns ? 'gap-2' : 'flex-row flex-wrap gap-x-4 gap-y-1.5'}>
      {items.map((it) => (
        <View key={it.label} className="flex-row items-center gap-1.5" accessible accessibilityLabel={it.value ? `${it.label} ${it.value}` : it.label}>
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: it.color }} />
          <Text variant="caption" tone="muted" className={columns ? 'flex-1' : undefined}>
            {it.label}
          </Text>
          {it.value ? (
            <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
              {it.value}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
