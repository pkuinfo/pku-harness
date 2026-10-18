import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { shadows, spacing, springs, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Icon } from './icon';

function move(list: string[], from: number, to: number) {
  'worklet';
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Row({
  id,
  index,
  step,
  height,
  order,
  onDrop,
  renderRow,
}: {
  id: string;
  index: number;
  step: number;
  height: number;
  order: SharedValue<string[]>;
  onDrop: (ids: string[]) => void;
  renderRow: (id: string, handle: ReactNode) => ReactNode;
}) {
  const c = useTheme();
  const top = useSharedValue(index * step);
  const startTop = useSharedValue(0);
  const active = useSharedValue(false);

  useAnimatedReaction(
    () => order.get().indexOf(id),
    (i, prev) => {
      if (i !== prev && !active.get()) top.set(withSpring(i * step, springs.smooth));
    },
  );

  const pan = usePanGesture({
    activateAfterLongPress: 120,
    onActivate: () => {
      'worklet';
      active.set(true);
      startTop.set(top.get());
      scheduleOnRN(haptics.tap);
    },
    onUpdate: (e) => {
      'worklet';
      top.set(startTop.get() + e.translationY);
      const list = order.get();
      const from = list.indexOf(id);
      const to = Math.max(0, Math.min(list.length - 1, Math.round(top.get() / step)));
      if (to !== from) {
        order.set(move(list, from, to));
        scheduleOnRN(haptics.select);
      }
    },
    onDeactivate: () => {
      'worklet';
      active.set(false);
      top.set(withSpring(order.get().indexOf(id) * step, springs.smooth));
      scheduleOnRN(onDrop, order.get());
    },
  });

  const style = useAnimatedStyle(() => ({
    top: top.get(),
    zIndex: active.get() ? 10 : 0,
    transform: [{ scale: withSpring(active.get() ? 1.03 : 1, springs.snappy) }],
    boxShadow: active.get() ? shadows.float : 'none',
  }));

  const handle = (
    <GestureDetector gesture={pan}>
      <View style={[styles.handle, { height }]} accessibilityRole="adjustable" accessibilityLabel="拖动调整位置">
        <Icon name="drag" size={20} color={c.textFaint} />
      </View>
    </GestureDetector>
  );

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.row, { height }, style]}>
      {renderRow(id, handle)}
    </Animated.View>
  );
}

/**
 * Vertical list reordered by dragging each row's handle (long-press, then drag). Rows are drawn
 * by the caller; the parent should remount the list (key) when ids are added or removed.
 */
export function SortableList({
  ids,
  rowHeight,
  onReorder,
  renderRow,
}: {
  ids: string[];
  rowHeight: number;
  onReorder: (ids: string[]) => void;
  renderRow: (id: string, handle: ReactNode) => ReactNode;
}) {
  const order = useSharedValue(ids);
  const step = rowHeight + spacing.sm;
  return (
    <View style={{ height: Math.max(0, ids.length * step - spacing.sm) }}>
      {ids.map((id, i) => (
        <Row key={id} id={id} index={i} step={step} height={rowHeight} order={order} onDrop={onReorder} renderRow={renderRow} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0 },
  handle: { width: 48, alignItems: 'center', justifyContent: 'center' },
});
