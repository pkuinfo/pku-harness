import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { KeyboardChatScrollView, useKeyboardState, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuroraAwake } from '@/components/aurora';
import { Button, IconButton } from '@/components/button';
import { FadeIn } from '@/components/fade-in';
import { Glass } from '@/components/glass';
import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { chatStore, useChat, useChatSelector } from '@/core/agent/chat-store';
import { useAIConfig } from '@/core/agent/provider';
import { interruptedTurn, retryLast, sendMessage, stopGeneration } from '@/core/agent/run';
import { radius, spacing } from '@/theme';
import { floatingOverlay } from '@/hooks/use-floating-overlay';
import { useFocusEnter } from '@/hooks/use-focus-enter';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';

import { AgentStatus } from './agent-status';
import { Composer } from './composer';
import { JumpToLatest } from './jump-to-latest';
import { MessageView } from './message';

/** Within this many px of the end counts as "at the latest" (and re-pins following). */
const NEAR_END = 72;

const SUGGESTIONS = ['校园卡还剩多少钱？', '帮我把余额和网费放到看板上', '每天早上 8 点检查余额，低于 100 元提醒我', '今天有什么课？'];

/** Chat tab: the agent conversation (docs/ARCHITECTURE.md §5–6). */
export function Chat() {
  const insets = useSafeAreaInsets();
  const bar = useTabBarInset();
  const enter = useFocusEnter();
  // The composer rides on the keyboard. Closed, it sits above the floating tab bar, which the
  // keyboard then covers, so it lifts only by the excess (never down: hardware/floating IMEs
  // report a zero-height keyboard).
  const keyboard = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: Math.min(0, keyboard.height.get() + bar) }] }));
  // Only what the frame needs; the streaming conversation itself re-renders inside <Messages>.
  const busy = useChatSelector((s) => s.status === 'streaming');
  const empty = useChatSelector((s) => s.messages.length === 0);
  // The backdrop keeps drifting while the agent works, even if nobody touches the screen.
  useAuroraAwake(busy);
  const { hasKey, config } = useAIConfig();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  // Follow the end only while the reader is there (Claude / ChatGPT behaviour). Dragging away
  // unpins; reaching the end again, sending, or tapping the pill re-pins. Following is driven by
  // content size, so late layout (Markdown, tool cards) still lands at the very end.
  const pinned = useRef(true);
  const dragging = useRef(false);
  const [away, setAway] = useState(false);
  const [unread, setUnread] = useState(false);

  // Measured sizes: scroll to the real end (contentHeight − viewport) instead of scrollToEnd.
  const size = useRef({ content: 0, viewport: 0 });
  const scrollEnd = useCallback((animated: boolean) => {
    const y = Math.max(0, size.current.content - size.current.viewport);
    scroll.current?.scrollTo({ y, animated });
  }, []);

  const toEnd = useCallback(
    (animated: boolean) => {
      pinned.current = true;
      dragging.current = false;
      setAway(false);
      setUnread(false);
      scrollEnd(animated);
    },
    [scrollEnd],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    size.current = { content: contentSize.height, viewport: layoutMeasurement.height };
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (dragging.current) {
      // Any pull away from the end while the finger is down hands control to the reader.
      if (distance > 8) pinned.current = false;
    } else if (distance < NEAR_END && !pinned.current) {
      pinned.current = true;
      setUnread(false);
    }
    setAway(!pinned.current);
  }, []);

  // A message the user just sent always brings the view back to the end, even when unpinned.
  const lastUserId = useChatSelector((s) => s.messages.findLast((m) => m.role === 'user')?.id);
  const seenUserId = useRef(lastUserId);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    size.current.content = h;
    if (lastUserId !== seenUserId.current) {
      seenUserId.current = lastUserId;
      toEnd(true);
    } else if (pinned.current && !dragging.current) {
      // Never move the list under a finger.
      scrollEnd(!busy);
    } else {
      setUnread(true);
    }
  }, [busy, lastUserId, toEnd, scrollEnd]);


  // The jump pill floats just above the composer, in the tabs' overlay (outside the blur target,
  // so it frosts the messages like the tab bar does). Hidden while typing and off this tab.
  const [composerHeight, setComposerHeight] = useState(0);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const typing = useKeyboardState((k) => k.isVisible);
  const showJump = away && !empty && focused && !typing;
  useEffect(() => {
    floatingOverlay.set(showJump ? { bottom: bar + composerHeight + spacing.sm, node: <JumpToLatest unread={unread} onPress={() => toEnd(true)} /> } : null);
  }, [showJump, bar, composerHeight, unread, toEnd]);
  useEffect(() => () => floatingOverlay.set(null), []);

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-3 px-4 pb-2" style={{ paddingTop: insets.top + spacing.sm }}>
        <Logo size={32} orbiting={busy} />
        <View className="flex-1">
          <Text variant="headline">PKU Harness</Text>
          <Text variant="caption" tone="faint">
            {hasKey ? `${config.name} · ${config.model}` : '未连接 AI 服务'}
          </Text>
        </View>
        {!empty ? <IconButton icon="plus" label="新对话" variant="ghost" onPress={() => chatStore.clear()} /> : null}
      </View>

      <Animated.View className="flex-1" style={enter}>
      {/* Keyboard-aware chat list: lifts with the keyboard (minus the tab bar it covers). */}
      <KeyboardChatScrollView
        ref={scroll}
        offset={bar}
        keyboardLiftBehavior="whenAtEnd"
        style={{ flex: 1 }}
        contentContainerStyle={[styles.list, empty && { flexGrow: 1, justifyContent: 'center' }]}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={32}
        onLayout={(e) => (size.current.viewport = e.nativeEvent.layout.height)}
        // Only a finger unpins. Android also fires momentum events for programmatic scrolls, so
        // a fling keeps "dragging" until its momentum ends, and nothing else sets it.
        onScrollBeginDrag={() => (dragging.current = true)}
        onScrollEndDrag={(e) => {
          if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) dragging.current = false;
        }}
        onMomentumScrollEnd={() => (dragging.current = false)}
        onContentSizeChange={onContentSizeChange}>
        {empty ? (
          <FadeIn style={styles.heroWrap}>
            <Glass radius={radius.xl} style={styles.hero}>
              <Logo size={84} intro orbiting />
              <Text variant="title" align="center">
                今天想让我做什么？
              </Text>
              {!hasKey ? (
                <FadeIn index={1} style={{ alignItems: 'center', gap: spacing.md }}>
                  <Text variant="callout" tone="muted" align="center">
                    先连接一个 AI 服务（默认 DeepSeek），我就能开始工作。
                  </Text>
                  <Button title="连接 AI 服务" icon="key" onPress={() => router.push('/ai-settings')} />
                </FadeIn>
              ) : (
                <View className="flex-row flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s, i) => (
                    <FadeIn key={s} index={i + 1}>
                      <Glass radius={radius.md} onPress={() => sendMessage(s)} accessibilityLabel={s} style={styles.suggestion}>
                        <Text variant="callout">{s}</Text>
                      </Glass>
                    </FadeIn>
                  ))}
                </View>
              )}
            </Glass>
          </FadeIn>
        ) : (
          <Messages />
        )}
      </KeyboardChatScrollView>
      </Animated.View>

      <Animated.View style={lift} onLayout={(e) => setComposerHeight(Math.round(e.nativeEvent.layout.height))}>
        <Composer busy={busy} onSend={sendMessage} onStop={stopGeneration} glass={empty} />
      </Animated.View>
      <View style={{ height: bar }} />
    </View>
  );
}

function submitForm(callId: string, form: Record<string, unknown>, label?: string) {
  for (const m of chatStore.get().messages) {
    if (m.parts.some((p) => p.type === 'ui' && p.callId === callId)) {
      chatStore.updateMessage(m.id, (msg) => ({
        ...msg,
        parts: msg.parts.map((p) => (p.type === 'ui' && p.callId === callId ? { ...p, submitted: true } : p)),
      }));
    }
  }
  sendMessage(`${label ?? '提交'}：${JSON.stringify(form)}`);
}

/** The conversation: the only part of the screen that re-renders while a reply streams in. */
function Messages() {
  const chat = useChat();
  const busy = chat.status === 'streaming';
  // The reply started when the last user message was sent.
  const startedAt = chat.messages.findLast((m) => m.role === 'user')?.createdAt ?? 0;
  return (
    <>
      {chat.messages.map((m, i) => (
        <MessageView key={m.id} message={m} onSubmitForm={submitForm} streaming={busy && i === chat.messages.length - 1} />
      ))}
      {busy ? <AgentStatus reply={chat.messages.at(-1)} startedAt={startedAt} /> : null}
      {interruptedTurn(chat) ? (
        <View className="flex-row items-center gap-3">
          <Text variant="callout" tone="muted" className="flex-1">
            回复中断了
          </Text>
          <Button title="重试" size="sm" variant="secondary" icon="refresh" onPress={() => void retryLast()} />
        </View>
      ) : null}
      {chat.error ? (
        <View className="rounded-md bg-down-muted p-3">
          <Text variant="callout" tone="down">
            {chat.error}
          </Text>
        </View>
      ) : null}
    </>
  );
}

// FadeIn, Glass and KeyboardChatScrollView take no className, so their layout stays in style.
const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.xl },
  heroWrap: { alignSelf: 'stretch' },
  hero: { alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  suggestion: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
