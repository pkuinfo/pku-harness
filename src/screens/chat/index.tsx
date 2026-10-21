import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { KeyboardChatScrollView, useKeyboardState, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuroraAwake } from '@/components/aurora';
import { Button, IconButton } from '@/components/button';
import { FadeIn } from '@/components/fade-in';
import { Glass } from '@/components/glass';
import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { AgentOrbit } from '@/components/agent-orbit';
import { PressableScale } from '@/components/pressable-scale';
import { chatStore, useChat, useChatSelector } from '@/core/agent/session/chat-store';
import { useAIConfig } from '@/core/agent/provider';
import { interruptedTurn, regenerateLast, retryLast, sendMessage } from '@/core/agent/run';
import { sessions, useActiveSessionId, useEditing, useRenameRequest, useSessionMeta, useSessions } from '@/core/agent/session/sessions';
import { registry } from '@/core/runtime/registry';
import { radius, spacing, typography, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';
import { floatingOverlay } from '@/hooks/use-floating-overlay';
import { useFocusEnter } from '@/hooks/use-focus-enter';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';

import { AgentStatus } from './agent-status';
import { Composer } from '@/screens/chat/composer';
import { composerDraft } from './composer/draft';
import { JumpToLatest } from './jump-to-latest';
import { MessageView } from './message';

/** The last message is an assistant reply with something in it (text, tools, UI). */
const hasReplyContent = (messages: { role: string; parts: unknown[] }[]) => {
  const last = messages.filter((m) => m.role !== 'event').at(-1);
  return last?.role === 'assistant' && last.parts.length > 0;
};

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

  // Last distance from the end, so the pin can be re-checked when scrolling settles (a fling
  // that coasts to the end ends while still "dragging"; no scroll event follows it).
  const distance = useRef(0);
  const settle = useCallback(() => {
    dragging.current = false;
    if (distance.current < NEAR_END && !pinned.current) {
      pinned.current = true;
      setUnread(false);
    }
    setAway(!pinned.current);
  }, []);

  // What counts as "new content" for the 新回复 pill: more messages or more streamed parts/text.
  // Plain relayout (an image loading, a theme switch, a font scale change) is not new.
  const contentSig = useChatSelector((s) => {
    const last = s.messages.at(-1);
    const lastText = last?.parts.reduce((n, p) => n + (p.type === 'text' ? p.text.length : 0), 0) ?? 0;
    return `${s.messages.length}:${last?.parts.length ?? 0}:${lastText}`;
  });
  const sig = useRef(contentSig);
  useEffect(() => {
    sig.current = contentSig;
  }, [contentSig]);
  const sigAtLeave = useRef(contentSig);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    size.current = { content: contentSize.height, viewport: layoutMeasurement.height };
    distance.current = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const d = distance.current;
    if (dragging.current) {
      // Any pull away from the end while the finger is down hands control to the reader.
      if (d > 8 && pinned.current) {
        pinned.current = false;
        sigAtLeave.current = sig.current;
      }
    } else if (d < NEAR_END && !pinned.current) {
      pinned.current = true;
      setUnread(false);
    }
    setAway(!pinned.current);
  }, []);

  // A message the user just sent always brings the view back to the end, even when unpinned.
  const lastUserId = useChatSelector((s) => s.messages.findLast((m) => m.role === 'user')?.id);
  const seenUserId = useRef(lastUserId);

  // Another session opened (sheet, notification): land at its end.
  const sessionId = useActiveSessionId();
  const seenSession = useRef(sessionId);
  useEffect(() => {
    if (seenSession.current === sessionId) return;
    seenSession.current = sessionId;
    seenUserId.current = lastUserId;
    pinned.current = true;
    setAway(false);
    setUnread(false);
    requestAnimationFrame(() => scrollEnd(false));
  }, [sessionId, lastUserId, scrollEnd]);

  // A tapped "回复好了" notification opens its session (`/?session=<id>`).
  const params = useLocalSearchParams<{ session?: string }>();
  useEffect(() => {
    if (!params.session) return;
    void sessions.open(params.session);
    router.setParams({ session: undefined });
  }, [params.session]);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    size.current.content = h;
    if (lastUserId !== seenUserId.current) {
      seenUserId.current = lastUserId;
      toEnd(true);
    } else if (pinned.current && !dragging.current) {
      // Never move the list under a finger.
      scrollEnd(!busy);
    } else if (sig.current !== sigAtLeave.current) {
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
      // Back on the tab while following: land on the latest, not wherever the list was left.
      if (pinned.current) requestAnimationFrame(() => scrollEnd(false));
      return () => setFocused(false);
    }, [scrollEnd]),
  );
  const typing = useKeyboardState((k) => k.isVisible);
  const showJump = away && !empty && focused && !typing;
  useEffect(() => {
    floatingOverlay.set(showJump ? { bottom: bar + composerHeight + spacing.sm, node: <JumpToLatest unread={unread} onPress={() => toEnd(true)} /> } : null);
  }, [showJump, bar, composerHeight, unread, toEnd]);
  useEffect(() => () => floatingOverlay.set(null), []);

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-2 px-4 pb-2" style={{ paddingTop: insets.top + spacing.sm }}>
        <SessionsButton />
        <ChatTitle fallbackName={config.name} fallbackModel={config.model} connected={hasKey} />
        {!empty ? <IconButton icon="plus" label="新对话" variant="ghost" onPress={() => void sessions.create()} /> : null}
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
          if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle();
        }}
        onMomentumScrollEnd={settle}
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
        <EditBanner />
        <Composer glass={empty} />
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

const regenerate = () => void regenerateLast();

/** The conversation: the only part of the screen that re-renders while a reply streams in. */
function Messages() {
  const chat = useChat();
  const busy = chat.status === 'streaming';
  // The reply started when the last user message was sent.
  const startedAt = chat.messages.findLast((m) => m.role === 'user')?.createdAt ?? 0;
  // Notices after a reply don't take its "latest" footer (重新生成, resting orbit).
  const lastId = chat.messages.findLast((m) => m.role !== 'event')?.id;
  const reply = busy ? chat.messages.find((m) => m.id === chat.running) : undefined;
  return (
    <>
      {chat.messages.map((m) => (
        <MessageView
          key={m.id}
          message={m}
          onSubmitForm={submitForm}
          streaming={busy && m.id === chat.running}
          last={m.id === lastId}
          onRegenerate={regenerate}
        />
      ))}
      {busy ? <AgentStatus reply={reply ?? chat.messages.at(-1)} startedAt={startedAt} /> : null}
      {/* Only when nothing of the reply arrived; a cut-off reply with content says so (and offers
          重试) in its own footer, so the status is never shown twice. */}
      {!busy && interruptedTurn(chat) && !hasReplyContent(chat.messages) ? (
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

/** Header left: opens the sessions sheet; an orbit while another session replies, a dot when one is unread. */
function SessionsButton() {
  const list = useSessions();
  const active = useActiveSessionId();
  const othersBusy = list.some((m) => m.id !== active && m.status === 'streaming');
  const othersUnread = list.some((m) => m.id !== active && m.unread);
  return (
    <View>
      <IconButton icon="drag" label={othersUnread ? '对话列表，有新回复' : '对话列表'} variant="ghost" onPress={() => router.push('/sessions')} />
      {othersBusy ? (
        <View pointerEvents="none" className="absolute -top-0.5 -right-0.5 rounded-full bg-elevated p-px">
          <AgentOrbit state="writing" size={14} />
        </View>
      ) : othersUnread ? (
        <View pointerEvents="none" className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" />
      ) : null}
    </View>
  );
}

/** Session title (tap to rename inline) over `provider · model`. */
function ChatTitle({ fallbackName, fallbackModel, connected }: { fallbackName: string; fallbackModel: string; connected: boolean }) {
  const c = useTheme();
  const meta = useSessionMeta();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const title = meta?.title || '新对话';
  const providerName = meta?.providerId ? (registry.provider(meta.providerId)?.def.name ?? meta.providerId) : fallbackName;
  const model = meta?.model ?? fallbackModel;
  const canRename = !!meta && meta.messageCount > 0;
  const start = useCallback(() => {
    if (!meta) return;
    haptics.select();
    setDraft(meta.title ?? '');
    setRenaming(true);
  }, [meta]);
  // `/rename` without a title starts the inline rename here.
  const request = useRenameRequest();
  const seen = useRef(request);
  useEffect(() => {
    if (request === seen.current) return;
    seen.current = request;
    start();
  }, [request, start]);
  const save = () => {
    if (meta && draft.trim()) void sessions.rename(meta.id, draft);
    setRenaming(false);
  };
  return (
    <View className="flex-1">
      {renaming ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={save}
          onBlur={() => setRenaming(false)}
          placeholder="对话标题"
          placeholderTextColor={c.textFaint}
          selectionColor={c.accent}
          accessibilityLabel="重命名对话"
          className="border-b-[0.5px] border-accent p-0"
          style={[typography.headline, { color: c.text }]}
        />
      ) : (
        <PressableScale haptic={false} disabled={!canRename} onPress={start} accessibilityRole="button" accessibilityLabel={`${title}，点按重命名`}>
          <Text variant="headline" numberOfLines={1}>
            {title}
          </Text>
        </PressableScale>
      )}
      <Text variant="caption" tone="faint" numberOfLines={1}>
        {connected || meta?.providerId ? `${providerName} · ${model}` : '未连接 AI 服务'}
      </Text>
    </View>
  );
}

/** 编辑消息 ✕: the next send replaces that message and everything after it. */
function EditBanner() {
  const editing = useEditing();
  if (!editing) return null;
  return (
    <View className="mx-4 mb-1 flex-row items-center gap-2 rounded-md bg-surface-2 py-1 pr-1 pl-3" style={{ borderCurve: 'continuous' }}>
      <Text variant="caption" tone="muted" className="flex-1">
        编辑消息 · 发送后将替换这条及之后的内容
      </Text>
      <IconButton
        icon="close"
        label="取消编辑"
        variant="ghost"
        size={28}
        onPress={() => {
          sessions.cancelEdit();
          composerDraft.clear();
        }}
      />
    </View>
  );
}

// FadeIn, Glass and KeyboardChatScrollView take no className, so their layout stays in style.
const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.xl },
  heroWrap: { alignSelf: 'stretch' },
  hero: { alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  suggestion: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
