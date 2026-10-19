import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radius } from '@/theme';
import { cx } from '@/utils/cx';

import { GlassEdges } from './glass';

const FILL = { 1: 'bg-surface', 2: 'bg-surface-2', 3: 'bg-surface-3' } as const;

/** A glass panel. Level 1–3 maps to surface fills; level 1 adds the edge and top light. */
export function Surface({
  level = 1,
  padded = true,
  children,
  style,
  className,
}: {
  level?: 1 | 2 | 3;
  padded?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  return (
    <View className={cx('rounded-lg', FILL[level], padded && 'p-4', className)} style={[{ borderCurve: 'continuous' }, style]}>
      {level === 1 ? <GlassEdges radius={radius.lg} /> : null}
      {children}
    </View>
  );
}
