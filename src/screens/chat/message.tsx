import type { Spec } from '@json-render/core';
import { StyleSheet, View } from 'react-native';
import Animated, { withSpring, withTiming, type EntryAnimationsValues } from 'react-native-reanimated';

import { FadeIn } from '@/components/fade-in';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import type { ChatMessage } from '@/core/agent/chat-store';
import { GenUIView } from '@/genui/view';
import { checkSpec } from '@/genui/check';
import { radius, springs, spacing, useTheme } from '@/theme';

import { ToolChip } from './tool-chip';

/** A sent message grows out of the composer: from its bottom-right corner, with a spring. */
function bubbleIn(_values: EntryAnimationsValues) {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 16 }, { scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, { duration: 160 }),
      transform: [{ translateY: withSpring(0, springs.snappy) }, { scale: withSpring(1, springs.snappy) }],
    },
  };
}

export function MessageView({
  message,
  onSubmitForm,
}: {
  message: ChatMessage;
  onSubmitForm: (callId: string, form: Record<string, unknown>, label?: string) => void;
}) {
  const c = useTheme();
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return (
      <View style={styles.userRow}>
        <Animated.View entering={bubbleIn} style={[styles.userBubble, { backgroundColor: c.accentMuted, borderColor: c.border }]}>
          <Text variant="body">{text}</Text>
        </Animated.View>
      </View>
    );
  }
  return (
    <View style={styles.assistant}>
      {message.parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return part.text.trim() ? (
              <FadeIn key={i}>
                <Text variant="body" selectable>
                  {part.text.trim()}
                </Text>
              </FadeIn>
            ) : null;
          case 'reasoning':
            return null;
          case 'tool':
            return <ToolChip key={i} part={part} />;
          case 'ui': {
            const r = checkSpec(part.spec);
            if (!r.ok) return null;
            return (
              <FadeIn key={i}>
                <Surface level={1} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
                  <View pointerEvents={part.submitted ? 'none' : 'auto'} style={{ opacity: part.submitted ? 0.55 : 1 }}>
                    <GenUIView
                      spec={r.spec as Spec}
                      onSubmit={(form, label) => onSubmitForm(part.callId, form, label)}
                    />
                  </View>
                </Surface>
              </FadeIn>
            );
          }
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '85%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    transformOrigin: 'right bottom',
  },
  assistant: { gap: spacing.md },
});
