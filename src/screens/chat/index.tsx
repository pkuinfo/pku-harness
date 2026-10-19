import { router } from 'expo-router';
import { useEffect, useRef, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardChatScrollView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { FadeIn } from '@/components/fade-in';
import { Glass } from '@/components/glass';
import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { chatStore, useChat } from '@/core/agent/chat-store';
import { useAIConfig } from '@/core/agent/provider';
import { interruptedTurn, retryLast, sendMessage, stopGeneration } from '@/core/agent/run';
import { radius, spacing, useTheme } from '@/theme';
import { useFocusEnter } from '@/hooks/use-focus-enter';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';

import { AgentStatus } from './agent-status';
import { Composer } from './composer';
import { MessageView } from './message';

const SUGGESTIONS = ['校园卡还剩多少钱？', '帮我把余额和网费放到看板上', '每天早上 8 点检查余额，低于 100 元提醒我', '今天有什么课？'];

/** Chat tab: the agent conversation (docs/ARCHITECTURE.md §5–6). */
export function Chat() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const bar = useTabBarInset();
  const enter = useFocusEnter();
  // The composer rides on the keyboard. Closed, it sits above the floating tab bar, which the
  // keyboard then covers, so it lifts only by the excess (never down: hardware/floating IMEs
  // report a zero-height keyboard).
  const keyboard = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: Math.min(0, keyboard.height.get() + bar) }] }));
  const chat = useChat();
  const { hasKey, config } = useAIConfig();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const busy = chat.status === 'streaming';
  // The reply started when the last user message was sent.
  const startedAt = chat.messages.findLast((m) => m.role === 'user')?.createdAt ?? 0;

  useEffect(() => {
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [chat.messages]);

  const submitForm = (callId: string, form: Record<string, unknown>, label?: string) => {
    for (const m of chatStore.get().messages) {
      if (m.parts.some((p) => p.type === 'ui' && p.callId === callId)) {
        chatStore.updateMessage(m.id, (msg) => ({
          ...msg,
          parts: msg.parts.map((p) => (p.type === 'ui' && p.callId === callId ? { ...p, submitted: true } : p)),
        }));
      }
    }
    sendMessage(`${label ?? '提交'}：${JSON.stringify(form)}`);
  };

  const empty = chat.messages.length === 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Logo size={32} orbiting={busy} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">PKU Harness</Text>
          <Text variant="caption" tone="faint">
            {hasKey ? `${config.name} · ${config.model}` : '未连接 AI 服务'}
          </Text>
        </View>
        {!empty ? <IconButton icon="plus" label="新对话" variant="ghost" onPress={() => chatStore.clear()} /> : null}
      </View>

      <Animated.View style={[{ flex: 1 }, enter]}>
      {/* Keyboard-aware chat list: lifts with the keyboard (minus the tab bar it covers). */}
      <KeyboardChatScrollView
        ref={scroll}
        offset={bar}
        keyboardLiftBehavior="whenAtEnd"
        style={{ flex: 1 }}
        contentContainerStyle={[styles.list, empty && { flexGrow: 1, justifyContent: 'center' }]}
        keyboardShouldPersistTaps="handled">
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
                <View style={styles.suggestions}>
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
          chat.messages.map((m, i) => <MessageView key={m.id} message={m} onSubmitForm={submitForm} streaming={busy && i === chat.messages.length - 1} />)
        )}
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
          <View style={[styles.error, { backgroundColor: c.downMuted }]}>
            <Text variant="callout" tone="down">
              {chat.error}
            </Text>
          </View>
        ) : null}
      </KeyboardChatScrollView>
      </Animated.View>

      <Animated.View style={lift}>
        <Composer busy={busy} onSend={sendMessage} onStop={stopGeneration} glass={empty} />
      </Animated.View>
      <View style={{ height: bar }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.xl },
  heroWrap: { alignSelf: 'stretch' },
  hero: { alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  suggestion: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  error: { padding: spacing.md, borderRadius: radius.md },
});
