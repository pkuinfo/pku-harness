import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, shadows, useThemeName } from '@/theme';
import { cx } from '@/utils/cx';

import { GlassEdges } from './glass';

const FILL = { 1: 'bg-surface', 2: 'bg-surface-2', 3: 'bg-surface-3' } as const;

/** Contained surface with stepped fills; dark panels add soft elevation and rounder corners. */
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
  const dark = useThemeName() === 'dark';
  return (
    <View className={cx('rounded-lg dark:rounded-xl', FILL[level], padded && 'p-4', className)} style={[{ borderCurve: 'continuous', boxShadow: dark ? shadows.darkCard : undefined }, style]}>
      {level === 1 ? <GlassEdges radius={dark ? radius.xl : radius.lg} /> : null}
      {children}
    </View>
  );
}
