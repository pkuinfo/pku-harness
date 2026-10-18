import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import type { Widget, WidgetSize } from '@/core/dashboard/types';
import { radius, shadows, spacing, springs, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

const ROW = 64;
const STEP = ROW + spacing.sm;

const SIZE_LABEL: Record<WidgetSize, string> = { sm: '小', md: '宽', lg: '大' };
const NEXT_SIZE: Record<WidgetSize, WidgetSize> = { sm: 'md', md: 'lg', lg: 'sm' };

function move(list: string[], from: number, to: number) {
  'worklet';
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Row({
  widget,
  initialIndex,
  order,
  dragging,
  onDrop,
  onRemove,
  onResize,
}: {
  widget: Widget;
  initialIndex: number;
  order: SharedValue<string[]>;
  dragging: SharedValue<string | null>;
  onDrop: (ids: string[]) => void;
  onRemove: () => void;
  onResize: () => void;
}) {
  const c = useTheme();
  const top = useSharedValue(initialIndex * STEP);
  const startTop = useSharedValue(0);
  const active = useSharedValue(false);

  // Follow the order when another row is dragged past this one.
  useAnimatedReaction(
    () => order.value.indexOf(widget.id),
    (index, prev) => {
      if (index !== prev && !active.value) top.set(withSpring(index * STEP, springs.smooth));
    },
  );

  const pan = usePanGesture({
    activateAfterLongPress: 120,
    onActivate: () => {
      'worklet';
      active.set(true);
      dragging.set(widget.id);
      startTop.set(top.value);
      scheduleOnRN(haptics.tap);
    },
    onUpdate: (e) => {
      'worklet';
      top.set(startTop.value + e.translationY);
      const from = order.value.indexOf(widget.id);
      const to = Math.max(0, Math.min(order.value.length - 1, Math.round(top.value / STEP)));
      if (to !== from) {
        order.set(move(order.value, from, to));
        scheduleOnRN(haptics.select);
      }
    },
    onDeactivate: () => {
      'worklet';
      active.set(false);
      dragging.set(null);
      top.set(withSpring(order.value.indexOf(widget.id) * STEP, springs.smooth));
      scheduleOnRN(onDrop, order.value);
    },
  });

  const style = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: active.value ? 10 : 0,
    transform: [{ scale: withSpring(active.value ? 1.03 : 1, springs.snappy) }],
    boxShadow: active.value ? shadows.float : 'none',
  }));

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.row, { backgroundColor: c.surface }, style]}>
      <GestureDetector gesture={pan}>
        <View style={styles.handle} accessibilityLabel={`拖动调整 ${widget.title} 的位置`} accessibilityRole="adjustable">
          <Icon name="drag" size={20} color={c.textFaint} />
        </View>
      </GestureDetector>
      <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
        {widget.title}
      </Text>
      <PressableScale accessibilityRole="button" accessibilityLabel={`切换大小，当前${SIZE_LABEL[widget.size]}`} onPress={onResize}>
        <Chip label={SIZE_LABEL[widget.size]} tone="neutral" />
      </PressableScale>
      <IconButton icon="trash" label={`移除 ${widget.title}`} variant="danger" size={36} onPress={onRemove} />
    </Animated.View>
  );
}

/** Edit mode: drag rows by the handle to reorder, cycle size, remove. */
export function EditList({
  widgets,
  onReorder,
  onRemove,
  onResize,
}: {
  widgets: Widget[];
  onReorder: (ids: string[]) => void;
  onRemove: (w: Widget) => void;
  onResize: (w: Widget, size: WidgetSize) => void;
}) {
  // The parent remounts this list (key) when widgets are added or removed.
  const order = useSharedValue(widgets.map((w) => w.id));
  const dragging = useSharedValue<string | null>(null);

  return (
    <View style={{ height: Math.max(0, widgets.length * STEP - spacing.sm) }}>
      {widgets.map((w, i) => (
        <Row
          key={w.id}
          widget={w}
          initialIndex={i}
          order={order}
          dragging={dragging}
          onDrop={onReorder}
          onRemove={() => onRemove(w)}
          onResize={() => onResize(w, NEXT_SIZE[w.size])}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingRight: spacing.md,
  },
  handle: { width: 48, height: ROW, alignItems: 'center', justifyContent: 'center' },
});
