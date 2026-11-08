import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { AgentOrbit } from '@/components/agent-orbit';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import type { ChatPart } from '@/core/agent/session/chat-store';
import { useT } from '@/i18n';
import { typography, useTheme } from '@/theme';

import { Chevron } from './tool-chip';
import { thinkingBody, thinkingPreview, thinkingSeconds, thinkingTail } from './thinking';

type ReasoningPart = Extract<ChatPart, { type: 'reasoning' }>;

/** Lines of thinking visible while it streams. */
const LIVE_LINES = 3;
const LIVE_HEIGHT = typography.caption.lineHeight * LIVE_LINES;

/**
 * One block of model thinking. While it streams: a fixed three-line window that follows the
 * newest words (bottom-aligned, so new lines push old ones up and the list never jumps). Once
 * the step moves on: one line, 「思考了 Ns · first line」, that expands to the full text on tap
 * and folds back when the reply finishes.
 */
export function ThinkingPill({ part, live, replyStreaming }: { part: ReasoningPart; live: boolean; replyStreaming: boolean }) {
  const c = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);

  // A pill opened by hand during the reply folds back once the reply is done.
  const wasStreaming = useRef(replyStreaming);
  useEffect(() => {
    if (wasStreaming.current && !replyStreaming) setOpen(false);
    wasStreaming.current = replyStreaming;
  }, [replyStreaming]);

  if (!part.text.trim()) return null;

  if (live) {
    return (
      <Animated.View entering={FadeIn.duration(180)} className="max-w-full self-stretch gap-1.5">
        <View className="flex-row items-center gap-2">
          <AgentOrbit state="thinking" size={14} />
          <Text variant="caption" tone="muted">
            {t('chat.thinking.live')}
          </Text>
        </View>
        <View className="justify-end overflow-hidden border-l-[1.5px] border-edge pl-3" style={{ height: LIVE_HEIGHT }} accessibilityLiveRegion="none">
          <Text variant="caption" tone="faint">
            {thinkingTail(thinkingBody(part.text))}
          </Text>
        </View>
      </Animated.View>
    );
  }

  const label = part.ms !== undefined ? t('chat.thinking.done', { s: thinkingSeconds(part.ms) }) : t('chat.thinking.untimed');
  const preview = thinkingPreview(part.text);
  return (
    <Animated.View layout={LinearTransition.springify().damping(22)} className="max-w-full self-start gap-1.5">
      <PressableScale
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={preview ? `${label} · ${preview}` : label}
        accessibilityHint={t(open ? 'chat.thinking.hide' : 'chat.thinking.show')}
        className="max-w-full flex-row items-center self-start gap-2 rounded-sm px-1 py-1"
        style={{ borderCurve: 'continuous' }}>
        <Icon name="sparkles" size={14} color={c.textFaint} />
        <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
          {label}
          {preview ? <Text variant="caption" tone="faint">{` · ${preview}`}</Text> : null}
        </Text>
        <Chevron open={open} color={c.textFaint} />
      </PressableScale>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} className="ml-[18px] border-l-[1.5px] border-edge py-1 pl-3">
          <Text variant="caption" tone="muted" selectable>
            {thinkingBody(part.text)}
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
