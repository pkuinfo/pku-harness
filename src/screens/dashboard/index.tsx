import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Button, IconButton } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { sendMessage } from '@/core/agent/run';
import { useWidgets, widgetStore } from '@/core/dashboard/store';
import type { Widget, WidgetSize } from '@/core/dashboard/types';
import { useLayout } from '@/hooks/use-layout';
import { radius, spacing, springs, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { EditList } from './edit-list';
import { WidgetCard } from './widget-card';

const IDEAS = ['把校园卡余额放到看板最上面', '加一个显示本学期第几周的卡片', '显示我接下来的三个提醒'];

function ask(text: string) {
  router.navigate('/');
  sendMessage(text);
}

/** Dashboard tab: widgets the agent builds and the user arranges (docs/ARCHITECTURE.md §7). */
export function Dashboard() {
  const c = useTheme();
  const widgets = useWidgets();
  const { contentWidth, columns } = useLayout();
  const [editing, setEditing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const gridWidth = contentWidth - spacing.lg * 2;
  const small = (gridWidth - spacing.md * (columns - 1)) / columns;
  const widthOf = (size: WidgetSize) => (size === 'sm' ? small : gridWidth);

  const enterEdit = () => {
    haptics.tap();
    setEditing(true);
  };

  const refresh = () => {
    setRefreshing(true);
    setRefreshToken((n) => n + 1);
    // Cards refetch independently; the spinner only acknowledges the gesture.
    setTimeout(() => setRefreshing(false), 600);
  };

  const remove = (w: Widget) => {
    haptics.warning();
    widgetStore.remove(w.id);
  };
  const resize = (w: Widget, size: WidgetSize) => {
    haptics.select();
    widgetStore.put({ ...w, size, updatedAt: Date.now() });
  };

  return (
    <Screen
      title="看板"
      subtitle="Dashboard"
      trailing={
        widgets.length ? (
          editing ? (
            <Button title="完成" size="sm" onPress={() => setEditing(false)} />
          ) : (
            <IconButton icon="edit" label="编辑看板" variant="ghost" onPress={enterEdit} />
          )
        ) : null
      }
      refreshControl={
        editing ? undefined : (
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.surface} />
        )
      }>
      {widgets.length === 0 ? (
        <Animated.View entering={FadeIn} style={{ gap: spacing.lg }}>
          <EmptyState
            icon="sparkles"
            title="让 AI 帮你搭建看板"
            message="告诉它你想随时看到哪些数字，它会生成卡片并保持更新。"
          />
          <View style={{ gap: spacing.sm }}>
            {IDEAS.map((idea) => (
              <PressableScale
                key={idea}
                accessibilityRole="button"
                accessibilityLabel={idea}
                onPress={() => ask(idea)}
                style={[styles.idea, { backgroundColor: c.surface }]}>
                <Text variant="callout" style={{ flex: 1 }}>
                  {idea}
                </Text>
                <Text variant="callout" tone="accent">
                  问 AI
                </Text>
              </PressableScale>
            ))}
          </View>
        </Animated.View>
      ) : editing ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ gap: spacing.lg }}>
          <Text variant="callout" tone="muted">
            按住左侧把手拖动排序，点大小标签切换尺寸。想改内容，直接在对话里告诉 AI。
          </Text>
          <EditList
            key={widgets.map((w) => w.id).sort().join()}
            widgets={widgets} onReorder={(ids) => widgetStore.reorder(ids)} onRemove={remove} onResize={resize} />
        </Animated.View>
      ) : (
        <View style={styles.grid}>
          {widgets.map((w, i) => (
            <Animated.View
              key={w.id}
              entering={FadeIn.delay(Math.min(i, 8) * 40)}
              layout={LinearTransition.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness)}
              style={{ width: widthOf(w.size) }}>
              <WidgetCard widget={w} refreshToken={refreshToken} onLongPress={enterEdit} />
            </Animated.View>
          ))}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="让 AI 添加组件"
            onPress={() => router.navigate('/')}
            style={[styles.add, { borderColor: c.border, width: gridWidth }]}>
            <Text variant="callout" tone="muted">
              ＋ 在对话里让 AI 添加或修改组件
            </Text>
          </PressableScale>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  idea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  add: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
