import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/text';
import type { ChatMessage } from '@/core/agent/session/chat-store';
import { getLocale, translate, useLocale, useT, type Locale } from '@/i18n';
import { typography, useTheme } from '@/theme';

import { AgentOrbit, type OrbitState } from '@/components/agent-orbit';

import { formatCount } from './composer/logic';
import { toolLabel, toolPluginLabel } from './labels';

type Phase = { verb: string; detail?: string; orbit: Exclude<OrbitState, 'rest'> };

/** What the agent is doing right now, read from the reply being built (in `locale`). */
export function phaseOf(reply: ChatMessage | undefined, locale: Locale = getLocale()): Phase {
  const t = (key: 'calling' | 'thinking' | 'writing' | 'wrapping') => translate(locale, `chat.status.${key}`);
  const parts = reply?.role === 'assistant' ? reply.parts : [];
  const running = [...parts].reverse().find((p) => p.type === 'tool' && p.status === 'running');
  if (running && running.type === 'tool') {
    const plugin = toolPluginLabel(running.toolId, locale);
    return { verb: t('calling'), detail: [plugin, toolLabel(running.toolId, locale)].filter(Boolean).join(' · '), orbit: 'tool' };
  }
  const last = parts.at(-1);
  if (last?.type === 'reasoning') return { verb: t('thinking'), orbit: 'thinking' };
  if (last?.type === 'text' && last.text.trim()) return { verb: t('writing'), orbit: 'writing' };
  if (last?.type === 'tool' || last?.type === 'ui') return { verb: t('wrapping'), orbit: 'thinking' };
  return { verb: t('thinking'), orbit: 'thinking' };
}

/**
 * The agent's live status line while a reply is in flight: the agent orbit, the current phase
 * (thinking / calling a plugin tool / writing), elapsed time and output size.
 */
export function AgentStatus({ reply, startedAt }: { reply: ChatMessage | undefined; startedAt: number }) {
  const c = useTheme();
  const tr = useT();
  const locale = useLocale();
  // Elapsed seconds only; the orbit animates on the UI thread, so no fast JS timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // The verb breathes between muted and accent.
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse]);
  const verbStyle = useAnimatedStyle(() => ({ color: interpolateColor(pulse.get(), [0, 1], [c.textMuted, c.accent]) }));

  const phase = phaseOf(reply, locale);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const chars = (reply?.parts ?? []).reduce((n, p) => n + (p.type === 'text' || p.type === 'reasoning' ? p.text.length : 0), 0);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={[phase.verb, phase.detail].filter(Boolean).join(' ')} className="flex-row items-center gap-2 py-1">
      <AgentOrbit state={phase.orbit} size={20} />
      <Animated.Text style={[typography.callout, verbStyle]}>{`${phase.verb}…`}</Animated.Text>
      {phase.detail ? (
        <Text variant="callout" tone="muted" numberOfLines={1} className="shrink">
          {phase.detail}
        </Text>
      ) : null}
      <Text variant="caption" tone="faint">
        {`${seconds}s${chars ? ` · ${tr('chat.count.chars', { count: chars, n: formatCount(chars) })}` : ''}`}
      </Text>
    </View>
  );
}
