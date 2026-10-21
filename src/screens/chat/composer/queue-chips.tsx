import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import type { QueuedMessage } from '@/core/agent/session/sessions';
import { useT } from '@/i18n';
import { springs, useTheme } from '@/theme';

import { firstLine, type Tr } from './logic';

const CURVE = { borderCurve: 'continuous' } as const;

function preview(m: QueuedMessage, t: Tr): string {
  const text = firstLine(m.text, 60);
  if (text) return text;
  const n = m.attachments.length;
  return n ? t('chat.queue.attachments', { count: n }) : t('chat.queue.empty');
}

/**
 * Messages sent while a reply streams wait here, above the composer (§4.4): "排队中 · …", ✕ to
 * remove, tap to pull back into the composer. Stopped or failed replies pause the queue:
 * "已暂停 · …" and 继续发送.
 */
export function QueueChips({
  queue,
  paused,
  onPull,
  onRemove,
  onResume,
}: {
  queue: QueuedMessage[];
  paused: boolean;
  onPull: (m: QueuedMessage) => void;
  onRemove: (m: QueuedMessage) => void;
  onResume: () => void;
}) {
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  if (!queue.length) return null;
  const enter = reduced ? FadeIn : FadeInDown.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness);
  const layout = reduced ? undefined : LinearTransition.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness);
  return (
    <Animated.View layout={layout} className="gap-1.5">
      {paused ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} className="flex-row items-center gap-2 px-1">
          <Icon name="pause" size={14} color={c.warn} />
          <Text variant="caption" tone="muted" className="flex-1">
            {t('chat.queue.pausedBanner')}
          </Text>
          <Button title={t('chat.queue.resume')} icon="play" size="sm" variant="secondary" onPress={onResume} />
        </Animated.View>
      ) : null}
      {queue.map((m) => (
        <Animated.View key={m.id} entering={enter} exiting={FadeOut} layout={layout}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('chat.queue.itemA11y', { state: t(paused ? 'chat.queue.paused' : 'chat.queue.queued'), text: preview(m, t) })}
            accessibilityHint={t('chat.queue.pullHint')}
            onPress={() => onPull(m)}
            className="flex-row items-center gap-2 rounded-md border-[0.5px] border-edge bg-elevated py-1 pl-3 pr-1"
            style={CURVE}>
            <Icon name={paused ? 'pause' : 'clock'} size={14} color={paused ? c.warn : c.textMuted} />
            <Text variant="caption" tone={paused ? 'warn' : 'muted'}>
              {`${t(paused ? 'chat.queue.paused' : 'chat.queue.queued')} ·`}
            </Text>
            <Text variant="callout" numberOfLines={1} className="flex-1">
              {preview(m, t)}
            </Text>
            {m.attachments.length > 0 && m.text.trim() ? <Icon name="image" size={14} color={c.textFaint} /> : null}
            <PressableScale accessibilityRole="button" accessibilityLabel={t('chat.queue.remove')} onPress={() => onRemove(m)} hitSlop={6} scaleTo={0.85} className="size-8 items-center justify-center rounded-sm">
              <Icon name="close" size={14} color={c.textMuted} />
            </PressableScale>
          </PressableScale>
        </Animated.View>
      ))}
    </Animated.View>
  );
}
