import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { useChat } from '@/core/agent/chat-store';
import { useTabsBlurTarget } from '@/hooks/use-floating-overlay';
import { shadows, springs, useTheme, useThemeName } from '@/theme';

import { GLYPHS, phaseOf } from './agent-status';

/**
 * Floating "back to latest" pill, shown only while the reader has scrolled away from the end.
 * While the agent works it carries the live status (glyph + phase, e.g. 正在调用 树洞 · 读树洞帖子),
 * so the reader knows what's happening below without being dragged there; after a reply lands
 * it says 新回复; otherwise it's just the arrow. One tap returns to the end and follows again.
 */
export function JumpToLatest({ unread, onPress }: { unread: boolean; onPress: () => void }) {
  // Subscribes to the chat itself: the screen only re-sets the overlay when visibility changes.
  const chat = useChat();
  const busy = chat.status === 'streaming';
  const reply = chat.messages.at(-1);
  const c = useTheme();
  const theme = useThemeName();
  const blurTarget = useTabsBlurTarget();
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % GLYPHS.length), 120);
    return () => clearInterval(id);
  }, [busy]);

  const phase = busy ? phaseOf(reply) : null;
  const label = phase ? `${phase.verb}${phase.detail ? ` ${phase.detail}` : ''}` : unread ? '新回复' : null;
  const enter = reduced ? FadeIn : ZoomIn.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness).mass(springs.snappy.mass);
  const exit = reduced ? FadeOut : ZoomOut.duration(140);

  return (
    <Animated.View entering={enter} exiting={exit} pointerEvents="box-none" style={{ alignItems: 'center' }}>
      {/* Frosted glass: a real blur of the messages beneath (same method as the tab
          bar, rendered outside the blur target via the tabs' floating overlay) under a light 40 % tint of the page colour, so it reads over any text in both themes. */}
      <PressableScale
        onPress={onPress}
        scaleTo={0.94}
        accessibilityRole="button"
        accessibilityLabel={label ? `回到最新：${label}` : '回到最新'}
        style={{ maxWidth: 300, borderRadius: 999, borderCurve: 'continuous', boxShadow: shadows.float }}>
        <View
          style={{
            borderRadius: 999,
            borderCurve: 'continuous',
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.border,
          }}>
          {blurTarget ? <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={80} tint={theme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: 0.4 }]} />
          <View className={label ? 'flex-row items-center gap-2 py-2.5 pl-3.5 pr-3' : 'p-3'}>
            {phase ? (
              <Text variant="bodyStrong" tone="accent" className="w-4 text-center">
                {GLYPHS[frame]}
              </Text>
            ) : unread ? (
              <View className="h-2 w-2 rounded-full bg-brand" />
            ) : null}
            {label ? (
              <Text variant="callout" tone={phase ? 'muted' : 'default'} numberOfLines={1} className="shrink">
                {label}
              </Text>
            ) : null}
            <Icon name="down" size={18} color={c.text} />
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
