import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Surface } from '@/components/surface';
import { Text } from '@/components/text';

/** A titled glass card for one chart. `caption` sits under the title (selection readout). */
export function Section({ title, meta, caption, children }: { title: string; meta?: string; caption?: string; children: ReactNode }) {
  return (
    <Surface className="gap-3">
      <View className="gap-0.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="micro" tone="faint">
            {title}
          </Text>
          {meta ? (
            <Text variant="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
              {meta}
            </Text>
          ) : null}
        </View>
        {caption !== undefined ? (
          <Text variant="callout" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">
            {caption}
          </Text>
        ) : null}
      </View>
      {children}
    </Surface>
  );
}
