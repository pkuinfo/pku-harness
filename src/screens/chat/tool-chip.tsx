import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { AgentOrbit } from '@/components/agent-orbit';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import type { ChatPart } from '@/core/agent/session/chat-store';
import { useLocale, useT } from '@/i18n';
import { useTheme } from '@/theme';

import { toolLabel } from './labels';
import { timings, transitions } from '@/theme/transitions';

type ToolPart = Extract<ChatPart, { type: 'tool' }>;

function StatusIcon({ status }: { status: ToolPart['status'] }) {
  const c = useTheme();
  if (status === 'running') return <AgentOrbit state="tool" size={16} />;
  return <Icon name={status === 'error' ? 'warning' : 'check'} size={14} color={status === 'error' ? c.down : c.textFaint} />;
}

/** Compact line showing a tool the agent is running / ran. */
export function ToolChip({ part }: { part: ToolPart }) {
  const t = useT();
  const title = toolLabel(part.toolId, useLocale());
  return (
    <View className="max-w-full flex-row items-center self-start gap-2 py-1.5">
      <StatusIcon status={part.status} />
      <Text variant="caption" tone={part.status === 'error' ? 'down' : 'muted'} numberOfLines={2} className="shrink">
        {part.status === 'error' ? t('chat.tools.error', { title, error: part.error ?? '' }) : title}
      </Text>
    </View>
  );
}

/**
 * Consecutive tool calls folded into one line, like a work log: while running it names the
 * current step, when done it summarises and expands on tap. Failed calls always stay visible.
 */
export function ToolGroup({ parts }: { parts: ToolPart[] }) {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  if (parts.length === 1) return <ToolChip part={parts[0]} />;
  const titleOf = (p: ToolPart) => toolLabel(p.toolId, locale);

  const running = parts.find((p) => p.status === 'running');
  const failed = parts.filter((p) => p.status === 'error');
  const names = [...new Set(parts.map(titleOf))];
  const label = running
    ? t('chat.tools.step', { title: titleOf(running), n: parts.indexOf(running) + 1 })
    : t('chat.tools.used', { count: parts.length, names: `${names.slice(0, 3).join(t('chat.tools.listSep'))}${names.length > 3 ? '…' : ''}` });

  return (
    <Animated.View layout={transitions.layout} className="max-w-full self-start gap-1.5">
      <PressableScale
        disabled={!!running}
        dimmed={false}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        className="max-w-full flex-row items-center self-start gap-2 py-1.5"
        style={{ borderCurve: 'continuous' }}>
        <StatusIcon status={running ? 'running' : failed.length ? 'error' : 'done'} />
        <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
          {label}
        </Text>
        {!running && <Chevron open={open} color={c.textFaint} />}
      </PressableScale>
      {(open ? parts : failed).length > 0 && (
        <View className="ml-2 gap-2 border-l border-edge py-1 pl-3">
          {(open ? parts : failed).map((p) => (
            <Animated.View key={p.callId} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} className="flex-row items-center gap-2">
              <StatusIcon status={p.status} />
              <Text variant="caption" tone={p.status === 'error' ? 'down' : 'muted'} numberOfLines={2} className="shrink">
                {p.status === 'error' ? t('chat.tools.error', { title: titleOf(p), error: p.error ?? '' }) : titleOf(p)}
              </Text>
            </Animated.View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

/** Expand/collapse indicator shared by the chat's foldable rows. */
export function Chevron({ open, color }: { open: boolean; color: string }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? '180deg' : '0deg', timings.fast) }] }));
  return (
    <Animated.View style={style}>
      <Icon name="chevronDown" size={14} color={color} />
    </Animated.View>
  );
}
