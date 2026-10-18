import { router } from 'expo-router';
import { useEffect, useRef, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentOrb } from '@/components/agent-orb';
import { Button, IconButton } from '@/components/button';
import { FadeIn } from '@/components/fade-in';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { chatStore, useChat } from '@/core/agent/chat-store';
import { useAIConfig } from '@/core/agent/provider';
import { sendMessage, stopGeneration } from '@/core/agent/run';
import { radius, spacing, useTheme } from '@/theme';

import { Composer } from './composer';
import { MessageView } from './message';

const SUGGESTIONS = ['校园卡还剩多少钱？', '帮我把余额和网费放到看板上', '每天早上 8 点检查余额，低于 100 元提醒我', '今天有什么课？'];

/** Chat tab: the agent conversation (docs/ARCHITECTURE.md §5–6). */
export function Chat() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const chat = useChat();
  const { hasKey, config } = useAIConfig();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const busy = chat.status === 'streaming';

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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <AgentOrb size={36} state={busy ? 'thinking' : 'idle'} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">PKU Harness</Text>
          <Text variant="caption" tone="faint">
            {hasKey ? `${config.name} · ${config.model}` : '未连接 AI 服务'}
          </Text>
        </View>
        {!empty ? <IconButton icon="plus" label="新对话" variant="ghost" onPress={() => chatStore.clear()} /> : null}
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.list, empty && { flexGrow: 1, justifyContent: 'center' }]}
        keyboardShouldPersistTaps="handled">
        {empty ? (
          <View style={styles.hero}>
            <FadeIn>
              <AgentOrb size={160} />
            </FadeIn>
            <FadeIn index={1}>
              <Text variant="title" align="center">
                今天想让我做什么？
              </Text>
            </FadeIn>
            {!hasKey ? (
              <FadeIn index={2} style={{ alignItems: 'center', gap: spacing.md }}>
                <Text variant="callout" tone="muted" align="center">
                  先连接一个 AI 服务（默认 DeepSeek），我就能开始工作。
                </Text>
                <Button title="连接 AI 服务" icon="key" onPress={() => router.push('/ai-settings')} />
              </FadeIn>
            ) : (
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((s, i) => (
                  <FadeIn key={s} index={i + 2}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={s}
                      onPress={() => sendMessage(s)}
                      style={[styles.suggestion, { backgroundColor: c.surface, borderColor: c.border }]}>
                      <Text variant="callout">{s}</Text>
                    </PressableScale>
                  </FadeIn>
                ))}
              </View>
            )}
          </View>
        ) : (
          chat.messages.map((m) => <MessageView key={m.id} message={m} onSubmitForm={submitForm} />)
        )}
        {chat.error ? (
          <View style={[styles.error, { backgroundColor: c.downMuted }]}>
            <Text variant="callout" tone="down">
              {chat.error}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Composer busy={busy} onSend={sendMessage} onStop={stopGeneration} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.xl },
  suggestions: { alignSelf: 'stretch', gap: spacing.sm },
  suggestion: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  error: { padding: spacing.md, borderRadius: radius.md },
});
