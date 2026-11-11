import { useState, type ReactNode } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import type { ChatPart } from '@/core/agent/session/chat-store';
import { useT } from '@/i18n';
import { useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Chevron } from './tool-chip';
import { transitions } from '@/theme/transitions';

/**
 * The work before a reply's answer (thinking, tool calls, notes between them) folded into one
 * line once the answer starts: "Worked · 14 tool calls · 2 failed". Tap shows the full log.
 */
export function WorkLog({ parts, render }: { parts: ChatPart[]; render: (part: ChatPart, i: number) => ReactNode }) {
  const c = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const tools = parts.filter((p) => p.type === 'tool');
  const failed = tools.filter((p) => p.status === 'error').length;
  const label = [t('chat.tools.worked', { count: tools.length }), failed ? t('chat.tools.failed', { count: failed }) : ''].filter(Boolean).join(' · ');
  return (
    <Animated.View layout={transitions.layout} className="gap-1.5">
      <PressableScale
        onPress={() => {
          haptics.select();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        className="max-w-full flex-row items-center self-start gap-2 py-1.5"
        style={{ borderCurve: 'continuous' }}>
        <Icon name={failed ? 'warning' : 'check'} size={14} color={failed ? c.warn : c.textFaint} />
        <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
          {label}
        </Text>
        <Chevron open={open} color={c.textFaint} />
      </PressableScale>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} className="ml-2 gap-3 border-l border-edge py-1 pl-3">
          {parts.map((p, i) => (p.type === 'ui' ? null : render(p, i)))}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
