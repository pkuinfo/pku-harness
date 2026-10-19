import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  const c = useTheme();
  return (
    <View className="items-center gap-3 p-8">
      <View className="h-14 w-14 items-center justify-center rounded-lg border border-edge bg-surface-2" style={{ borderCurve: 'continuous' }}>
        <Icon name={icon} size={26} color={c.textMuted} />
      </View>
      <Text variant="headline" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="callout" tone="muted" align="center">
          {message}
        </Text>
      ) : null}
      {action}
    </View>
  );
}
