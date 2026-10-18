import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

/** A layered panel. Level 1–3 maps to surface tones; tone, not shadow, separates layers. */
export function Surface({
  level = 1,
  padded = true,
  children,
  style,
}: {
  level?: 1 | 2 | 3;
  padded?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const bg = level === 1 ? c.surface : level === 2 ? c.surface2 : c.surface3;
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          padding: padded ? spacing.lg : 0,
        },
        style,
      ]}>
      {children}
    </View>
  );
}
