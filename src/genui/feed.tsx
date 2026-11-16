import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Text } from '@/components/text';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { spacing, useTheme } from '@/theme';

/** How close to the bottom (px) the next page starts loading: about two screens of posts ahead. */
const AHEAD = 1600;

type Metrics = { y: number; viewport: number; content: number };
type Feed = { subscribe: (listener: (m: Metrics) => void) => () => void; metrics: () => Metrics };

const FeedContext = createContext<Feed | null>(null);

/**
 * The scroll view of a feed screen (a plugin screen with `feed: true`): pull to refresh, and
 * scroll metrics for [EndReached], which loads the next page before the reader gets there.
 */
export function FeedScroll({ onRefresh, children }: { onRefresh?: () => Promise<void>; children: ReactNode }) {
  const c = useTheme();
  const bar = useTabBarInset();
  const metrics = useRef<Metrics>({ y: 0, viewport: 0, content: 0 });
  const listeners = useRef(new Set<(m: Metrics) => void>());
  const [refreshing, setRefreshing] = useState(false);
  const notify = useCallback(() => {
    for (const l of listeners.current) l(metrics.current);
  }, []);
  const feed = useMemo<Feed>(
    () => ({
      subscribe: (l) => {
        listeners.current.add(l);
        return () => listeners.current.delete(l);
      },
      metrics: () => metrics.current,
    }),
    [],
  );
  const refresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);
  return (
    <FeedContext.Provider value={feed}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl + bar, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={100}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          metrics.current = { ...metrics.current, y: e.nativeEvent.contentOffset.y };
          notify();
        }}
        onLayout={(e: LayoutChangeEvent) => {
          metrics.current = { ...metrics.current, viewport: e.nativeEvent.layout.height };
          notify();
        }}
        onContentSizeChange={(_, h) => {
          metrics.current = { ...metrics.current, content: h };
          notify();
        }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.textMuted} colors={[c.accent]} progressBackgroundColor={c.elevated} /> : undefined}>
        {children}
      </ScrollView>
    </FeedContext.Provider>
  );
}

/**
 * The end of a list: fires `reach` once the reader scrolls within [AHEAD] of it (or right away
 * when the list is shorter than the screen), again only after the list grew. Shows a spinner
 * while the page loads, and `doneLabel` once there is nothing more.
 */
export function EndReached({ done, doneLabel, loading, onReach }: { done: boolean; doneLabel: string | null; loading: boolean; onReach: () => void }) {
  const feed = useContext(FeedContext);
  const c = useTheme();
  // The content height the last `reach` fired at: the next one waits for the list to grow.
  const firedAt = useRef(-1);
  const reach = useRef(onReach);
  const state = useRef({ done, loading });
  useEffect(() => {
    reach.current = onReach;
    state.current = { done, loading };
  });
  useEffect(() => {
    if (!feed) return;
    const check = (m: Metrics) => {
      if (state.current.done || state.current.loading || m.content <= 0 || m.viewport <= 0) return;
      if (m.content - (m.y + m.viewport) > AHEAD || firedAt.current === m.content) return;
      firedAt.current = m.content;
      reach.current();
    };
    check(feed.metrics());
    return feed.subscribe(check);
  }, [feed, done, loading]);
  if (done) {
    return doneLabel ? (
      <Text variant="caption" tone="faint" align="center" style={{ paddingVertical: spacing.lg }}>
        {doneLabel}
      </Text>
    ) : null;
  }
  return <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>{loading || feed ? <ActivityIndicator color={c.textMuted} /> : null}</View>;
}
