import type { Spec } from '@json-render/core';
import { StyleSheet, View } from 'react-native';

import { FadeIn } from '@/components/fade-in';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import type { ChatMessage } from '@/core/agent/chat-store';
import { GenUIView } from '@/genui/view';
import { checkSpec } from '@/genui/check';
import { radius, spacing, useTheme } from '@/theme';

import { ToolChip } from './tool-chip';

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
      <FadeIn style={styles.userRow}>
        <View style={[styles.userBubble, { backgroundColor: c.surface3 }]}>
          <Text variant="body">{text}</Text>
        </View>
      </FadeIn>
    );
  }
  return (
    <View style={styles.assistant}>
      {message.parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return part.text.trim() ? (
              <Text key={i} variant="body" selectable>
                {part.text.trim()}
              </Text>
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
    borderRadius: radius.xl,
    borderBottomRightRadius: radius.sm,
    borderCurve: 'continuous',
  },
  assistant: { gap: spacing.md },
});
