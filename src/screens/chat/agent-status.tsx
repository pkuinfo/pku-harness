import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/text';
import type { ChatMessage } from '@/core/agent/chat-store';
import { registry } from '@/core/runtime/registry';
import { typography, useTheme } from '@/theme';

/** Claude Code's spinner glyphs, cycled so the agent visibly breathes while it works. */
const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];

type Phase = { verb: string; detail?: string };

/** What the agent is doing right now, read from the reply being built. */
function phaseOf(reply: ChatMessage | undefined): Phase {
  const parts = reply?.role === 'assistant' ? reply.parts : [];
  const running = [...parts].reverse().find((p) => p.type === 'tool' && p.status === 'running');
  if (running && running.type === 'tool') {
    const entry = registry.tool(running.toolId);
    const plugin = entry ? registry.get(entry.pluginId)?.name : undefined;
    return { verb: '正在调用', detail: [plugin, entry?.def.title ?? running.toolId].filter(Boolean).join(' · ') };
  }
  const last = parts.at(-1);
  if (last?.type === 'reasoning') return { verb: '思考中' };
  if (last?.type === 'text' && last.text.trim()) return { verb: '输出中' };
  if (last?.type === 'tool' || last?.type === 'ui') return { verb: '整理结果' };
  return { verb: '思考中' };
}

/**
 * The agent's live status line while a reply is in flight: a cycling glyph, the current phase
 * (thinking / calling a plugin tool / writing), elapsed time and output size.
 */
export function AgentStatus({ reply, startedAt }: { reply: ChatMessage | undefined; startedAt: number }) {
  const c = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % GLYPHS.length);
      setNow(Date.now());
    }, 120);
    return () => clearInterval(id);
  }, []);

  // The verb breathes between muted and accent.
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse]);
  const verbStyle = useAnimatedStyle(() => ({ color: interpolateColor(pulse.get(), [0, 1], [c.textMuted, c.accent]) }));

  const phase = phaseOf(reply);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const chars = (reply?.parts ?? []).reduce((n, p) => n + (p.type === 'text' || p.type === 'reasoning' ? p.text.length : 0), 0);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`${phase.verb}${phase.detail ?? ''}`} className="flex-row items-center gap-2 py-1">
      <Text variant="bodyStrong" tone="accent" className="w-5 text-center">
        {GLYPHS[frame]}
      </Text>
      <Animated.Text style={[typography.callout, verbStyle]}>{`${phase.verb}…`}</Animated.Text>
      {phase.detail ? (
        <Text variant="callout" tone="muted" numberOfLines={1} className="shrink">
          {phase.detail}
        </Text>
      ) : null}
      <Text variant="caption" tone="faint">
        {`${seconds}s${chars ? ` · ${chars} 字` : ''}`}
      </Text>
    </View>
  );
}
