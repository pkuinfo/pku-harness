import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { GlassEdges } from './glass';

/** A glass panel. Level 1–3 maps to surface fills; the edge and top light make it glass. */
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
      {level === 1 ? <GlassEdges radius={radius.lg} /> : null}
      {children}
    </View>
  );
}
