import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';

/** A flat, divided section for one chart. `caption` sits under the title (selection readout). */
export function Section({ title, meta, caption, children }: { title: string; meta?: string; caption?: string; children: ReactNode }) {
  return (
    <View className="gap-3 border-t border-edge py-3">
      <View className="gap-0.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="caption" tone="muted">
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
    </View>
  );
}
