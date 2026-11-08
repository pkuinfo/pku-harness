import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { useChat } from '@/core/agent/session/chat-store';
import { useLocale, useT } from '@/i18n';
import { springs, useTheme } from '@/theme';

import { AgentOrbit } from '@/components/agent-orbit';

import { phaseOf } from './agent-status';

/**
 * Floating "back to latest" pill, shown only while the reader has scrolled away from the end.
 * While the agent works it carries the live status (agent orbit + phase, e.g. 正在调用 树洞 · 读树洞帖子 /
 * Using Treehole · Read posts),
 * so the reader knows what's happening below without being dragged there; after a reply lands
 * it says 新回复; otherwise it's just the arrow. One tap returns to the end and follows again.
 */
export function JumpToLatest({ unread, onPress }: { unread: boolean; onPress: () => void }) {
  // Subscribes to the chat itself: the screen only re-sets the overlay when visibility changes.
  const chat = useChat();
  const busy = chat.status === 'streaming';
  const reply = chat.messages.at(-1);
  const c = useTheme();
  const reduced = useReducedMotion();
  const t = useT();
  const locale = useLocale();

  const phase = busy ? phaseOf(reply, locale) : null;
  const label = phase ? `${phase.verb}${phase.detail ? ` ${phase.detail}` : ''}` : unread ? t('chat.jump.newReply') : null;
  const enter = reduced ? FadeIn : ZoomIn.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness).mass(springs.snappy.mass);
  const exit = reduced ? FadeOut : ZoomOut.duration(140);

  return (
    <Animated.View entering={enter} exiting={exit} pointerEvents="box-none" style={{ alignItems: 'center' }}>
      <PressableScale
        onPress={onPress}
        scaleTo={0.94}
        accessibilityRole="button"
        accessibilityLabel={label ? t('chat.jump.toLatestWith', { label }) : t('chat.jump.toLatest')}
        className="max-w-[85%] overflow-hidden rounded-full border border-edge bg-elevated"
        style={{ borderCurve: 'continuous' }}>
        <View className={label ? 'min-h-10 flex-row items-center gap-2 px-3 py-2' : 'p-3'}>
          {phase ? (
            <AgentOrbit state={phase.orbit} size={18} />
          ) : unread ? (
            <View className="h-2 w-2 rounded-full bg-brand" />
          ) : null}
          {label ? (
            <Text variant="caption" tone={phase ? 'muted' : 'default'} numberOfLines={1} className="shrink">
              {label}
            </Text>
          ) : null}
          <Icon name="down" size={18} color={c.text} />
        </View>
      </PressableScale>
    </Animated.View>
  );
}
