import { View } from 'react-native';
import Animated, { LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { springs } from '@/theme';

/**
 * One horizontal stacked bar over a track. `capacity` is the track's full length (e.g. the
 * budget); segments keep a 2px gap and resize with a spring layout transition.
 */
export function StackedBar({ values, colors, capacity, height = 10, accessibilityLabel }: { values: number[]; colors: readonly string[]; capacity: number; height?: number; accessibilityLabel: string }) {
  const reduced = useReducedMotion();
  const total = values.reduce((a, b) => a + b, 0);
  const full = Math.max(capacity, total, 1);
  const layout = reduced ? undefined : LinearTransition.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness);
  const visible = values.map((v, i) => ({ v, i })).filter(({ v }) => v > 0);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      className="w-full flex-row overflow-hidden rounded-full bg-surface-2"
      style={{ height, gap: 2 }}>
      {visible.map(({ v, i }) => (
        <Animated.View key={i} layout={layout} style={{ width: `${(v / full) * 100}%`, minWidth: 2, backgroundColor: colors[i] }} />
      ))}
    </View>
  );
}
