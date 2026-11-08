import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  const c = useTheme();
  return (
    <View className="items-center gap-3 px-6 py-8">
      <View className="h-10 w-10 items-center justify-center" style={{ borderCurve: 'continuous' }}>
        <Icon name={icon} size={24} color={c.textMuted} />
      </View>
      <Text variant="bodyStrong" align="center">
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
