import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AgentOrbit } from '@/components/agent-orbit';
import { IconButton } from '@/components/button';
import { Text } from '@/components/text';
import type { ChatMessage, TurnMeta } from '@/core/agent/session/chat-store';
import { turnCaption } from '@/core/agent/session/session-utils';
import { haptics } from '@/utils/haptics';

import { modelLabel } from './composer/models';

const ENDED: Record<NonNullable<TurnMeta['ended']>, string> = { stopped: '已停止', error: '出错了', interrupted: '已中断' };

/**
 * Quiet row under a finished reply (Claude app style): copy on every reply; on the latest one
 * also the resting orbit and 重新生成. Tapping the orbit toggles the turn's stats (§6.5). A turn
 * cut short says so (已停止 / 已中断). Muted icons only, so it never competes with the answer.
 */
export function ReplyActions({ message, last, onRegenerate }: { message: ChatMessage; last: boolean; onRegenerate?: () => void }) {
  const text = message.parts
    .map((p) => (p.type === 'text' ? p.text.trim() : ''))
    .filter(Boolean)
    .join('\n\n');
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const meta = message.meta;
  const ended = meta?.ended ? ENDED[meta.ended] : null;
  if (!text && !last && !ended) return null;
  const hasStats = !!meta && (meta.durationMs != null || meta.inputTokens != null);
  const caption = hasStats ? turnCaption(meta, meta.providerId && meta.model ? safeLabel(meta.providerId, meta.model) : undefined) : '';
  return (
    <View className="gap-1">
      <View className="-ml-2 flex-row items-center gap-1">
        {last ? (
          // The status orbit at rest: the dot has come home, the indicator is the brand mark again.
          <Pressable
            disabled={!hasStats}
            onPress={() => {
              haptics.select();
              setStats((s) => !s);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={stats ? '隐藏回复统计' : '显示回复统计'}
            className="w-8 items-center">
            <AgentOrbit state="rest" size={18} />
          </Pressable>
        ) : null}
        {text ? (
          <IconButton
            icon={copied ? 'check' : 'copy'}
            label={copied ? '已复制' : '复制回答'}
            variant="ghost"
            size={32}
            onPress={() => {
              void Clipboard.setStringAsync(text);
              haptics.success();
              setCopied(true);
            }}
          />
        ) : null}
        {last && onRegenerate ? <IconButton icon="refresh" label="重新生成" variant="ghost" size={32} onPress={onRegenerate} /> : null}
        {ended ? (
          <Text variant="caption" tone={meta?.ended === 'error' ? 'down' : 'faint'} className="ml-1">
            {ended}
          </Text>
        ) : null}
      </View>
      {stats && caption ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)}>
          <Text variant="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
            {caption}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function safeLabel(providerId: string, model: string) {
  try {
    return modelLabel(providerId, model);
  } catch {
    return model;
  }
}
