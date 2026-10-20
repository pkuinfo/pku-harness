import { memo } from 'react';
import type { Spec } from '@json-render/core';
import { View } from 'react-native';
import Animated, { withSpring, withTiming, type EntryAnimationsValues } from 'react-native-reanimated';

import { FadeIn } from '@/components/fade-in';
import { Markdown } from '@/components/markdown';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import type { ChatMessage } from '@/core/agent/chat-store';
import { GenUIView } from '@/genui/view';
import { checkSpec } from '@/genui/check';
import { springs } from '@/theme';

import { ReplyActions } from './reply-actions';
import { ToolGroup } from './tool-chip';

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

/** The spec's top (through single-child wrappers) is a Card: it brings its own surface, don't nest two. */
function hasOwnCard(spec: Spec) {
  let el = spec.elements[spec.root];
  for (let depth = 0; el && depth < 4; depth++) {
    if (el.type === 'Card') return true;
    if (el.children?.length !== 1) return false;
    el = spec.elements[el.children[0]];
  }
  return false;
}

/**
 * One message. Memoised on the message object (immutable; only the streaming reply changes) so a
 * token re-renders one row, not the whole conversation.
 */
export const MessageView = memo(function MessageView({
  message,
  onSubmitForm,
  streaming = false,
  last = false,
  onRegenerate,
}: {
  message: ChatMessage;
  /** The latest message: its finished reply gets 重新生成 and the resting glyph. */
  last?: boolean;
  onRegenerate?: () => void;
  /** The reply is still arriving (its last text part may hold unterminated Markdown). */
  streaming?: boolean;
  onSubmitForm: (callId: string, form: Record<string, unknown>, label?: string) => void;
}) {
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return (
      <View className="items-end">
        <Animated.View
          entering={bubbleIn}
          className="max-w-[85%] rounded-lg rounded-br-sm border-[0.5px] border-edge bg-accent-muted px-4 py-3"
          style={{ borderCurve: 'continuous', transformOrigin: 'right bottom' }}>
          <Text variant="body">{text}</Text>
        </Animated.View>
      </View>
    );
  }
  // Consecutive tool calls render as one folded group, anchored at the first of them.
  type ToolPart = Extract<ChatMessage['parts'][number], { type: 'tool' }>;
  const groups = new Map<number, ToolPart[]>();
  let start = -1;
  message.parts.forEach((p, i) => {
    // Blank text and hidden reasoning between steps don't break a group.
    if (p.type === 'reasoning' || (p.type === 'text' && !p.text.trim())) return;
    if (p.type !== 'tool') return void (start = -1);
    if (start < 0) start = i;
    groups.set(start, [...(groups.get(start) ?? []), p]);
  });
  return (
    <View className="gap-3">
      {message.parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return part.text.trim() ? (
              <FadeIn key={i}>
                <Markdown text={part.text.trim()} streaming={streaming && i === message.parts.length - 1} />
              </FadeIn>
            ) : null;
          case 'reasoning':
            return null;
          case 'tool': {
            const group = groups.get(i);
            return group ? <ToolGroup key={i} parts={group} /> : null;
          }
          case 'ui': {
            const r = checkSpec(part.spec);
            if (!r.ok) return null;
            const spec = r.spec as Spec;
            const view = (
              <View pointerEvents={part.submitted ? 'none' : 'auto'} style={{ opacity: part.submitted ? 0.55 : 1 }}>
                <GenUIView spec={spec} onSubmit={(form, label) => onSubmitForm(part.callId, form, label)} />
              </View>
            );
            return <FadeIn key={i}>{hasOwnCard(spec) ? view : <Surface level={1}>{view}</Surface>}</FadeIn>;
          }
        }
      })}
      {!streaming && message.parts.length > 0 ? <ReplyActions message={message} last={last} onRegenerate={onRegenerate} /> : null}
    </View>
  );
}, (a, b) => a.message === b.message && a.streaming === b.streaming && a.last === b.last);
