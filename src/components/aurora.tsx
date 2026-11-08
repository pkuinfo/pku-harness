import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/theme';

/** Compatibility hooks for callers that previously kept the decorative backdrop awake. */
export function wakeAurora() {}
export function useAuroraAwake(_active: boolean) {}

/** A static neutral canvas; task activity is communicated by the actual task controls. */
export function Aurora(_props: { shift?: SharedValue<number> } = {}) {
  const c = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]} />;
}
