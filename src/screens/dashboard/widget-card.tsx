import type { Spec } from '@json-render/core';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Skeleton } from '@/components/skeleton';
import { Text } from '@/components/text';
import { useWidgetData } from '@/core/dashboard/resolve';
import type { Widget } from '@/core/dashboard/types';
import { GenUIView } from '@/genui/view';
import { radius, spacing, useTheme } from '@/theme';

/** One dashboard widget: title, then loading / error / live content. Long-press = edit mode. */
export function WidgetCard({ widget, refreshToken, onLongPress }: { widget: Widget; refreshToken: number; onLongPress: () => void }) {
  const c = useTheme();
  const { data, retry } = useWidgetData(widget, refreshToken);
  const spec = useMemo(
    () => (data.status === 'ready' ? ({ ...widget.spec, state: data.state } as unknown as Spec) : null),
    [data, widget.spec],
  );
  const hero = widget.size === 'lg';

  return (
    <PressableScale
      accessibilityRole="summary"
      accessibilityLabel={widget.title}
      accessibilityHint="长按编辑看板"
      onLongPress={onLongPress}
      delayLongPress={350}
      scaleTo={0.98}
      haptic={false}
      style={[styles.card, { backgroundColor: c.surface }, hero && styles.hero]}>
      {/* Small tiles are a single number whose label already names it. */}
      {widget.size === 'sm' ? null : (
        <View style={styles.head}>
          <Text variant="micro" tone="faint" numberOfLines={1} style={{ flex: 1 }}>
          {widget.title.toUpperCase()}
        </Text>
          {data.status === 'ready' && data.refreshing ? <View style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
        </View>
      )}
      {data.status === 'loading' ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton width="45%" height={hero ? 40 : 28} />
          <Skeleton width="70%" height={12} />
        </View>
      ) : data.status === 'error' ? (
        <View style={styles.error}>
          <View style={styles.errorRow}>
            <Icon name="warning" size={16} color={c.warn} />
            <Text variant="caption" tone="muted" numberOfLines={3} style={{ flex: 1 }}>
              {data.error}
            </Text>
          </View>
          <Button title="重试" size="sm" variant="secondary" icon="refresh" onPress={retry} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : spec ? (
        <GenUIView spec={spec} />
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md },
  hero: { paddingVertical: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: radius.full },
  error: { gap: spacing.md },
  errorRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
});
