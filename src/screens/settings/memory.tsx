import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/fade-in';
import { ListGroup, ListRow } from '@/components/list-group';
import { Screen } from '@/components/screen';
import { Skeleton } from '@/components/skeleton';
import { Text } from '@/components/text';
import { invokeTool } from '@/core/runtime/invoke';
import { spacing } from '@/theme';
import { haptics } from '@/utils/haptics';

type Item = { id: string; text: string; kind: string; pinned: boolean };

const KIND: Record<string, string> = { preference: '偏好', fact: '信息', routine: '习惯', person: '人', other: '其他' };

/** Settings → AI 记忆: everything the memory plugin holds, through its own tools. */
export function MemorySettings() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    invokeTool('memory.list', {}, { actor: 'user' })
      .then((r) => setItems(r as Item[]))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useFocusEffect(load);

  const forget = async (id: string) => {
    haptics.warning();
    setItems((cur) => cur?.filter((m) => m.id !== id) ?? null);
    await invokeTool('memory.forget', { id }, { actor: 'user' }).catch(load);
  };
  const pin = async (m: Item) => {
    haptics.select();
    setItems((cur) => cur?.map((x) => (x.id === m.id ? { ...x, pinned: !m.pinned } : x)) ?? null);
    await invokeTool('memory.pin', { id: m.id, pinned: !m.pinned }, { actor: 'user' }).catch(load);
  };

  return (
    <Screen title="AI 记忆" subtitle="Memory" back>
      <FadeIn index={0}>
        <Text variant="callout" tone="muted">
          AI 会记下你提到的长期信息，回答时参考相关的几条。记忆只保存在这台手机上；置顶的记忆每次都会带上。
        </Text>
      </FadeIn>
      {error ? (
        <EmptyState icon="warning" title="读取失败" message={error} />
      ) : items == null ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon="sparkles" title="还没有记忆" message="在对话里说「记住我是信科 2024 级的」，AI 就会记下来。" />
      ) : (
        <FadeIn index={1}>
          <ListGroup title={`${items.length} 条`}>
            {items.map((m) => (
              <Animated.View key={m.id} exiting={FadeOut} layout={LinearTransition}>
                <ListRow
                  title={m.text}
                  titleLines={4}
                  subtitle={KIND[m.kind] ?? m.kind}
                  accessory={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      {m.pinned ? <Chip label="置顶" tone="accent" /> : null}
                      <IconButton icon="bolt" label={m.pinned ? '取消置顶' : '置顶'} variant="ghost" size={36} onPress={() => pin(m)} />
                      <IconButton icon="trash" label="删除这条记忆" variant="ghost" size={36} onPress={() => forget(m.id)} />
                    </View>
                  }
                />
              </Animated.View>
            ))}
          </ListGroup>
        </FadeIn>
      )}
    </Screen>
  );
}
