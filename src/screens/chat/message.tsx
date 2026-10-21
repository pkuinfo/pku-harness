import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import type { Spec } from '@json-render/core';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn as Appear, FadeOut, withSpring, withTiming, type EntryAnimationsValues } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { FadeIn } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { Markdown } from '@/components/markdown';
import { Surface } from '@/components/surface';
import { Text, type TextTone } from '@/components/text';
import type { AttachmentPart, ChatMessage, ChatPart } from '@/core/agent/session/chat-store';
import { formatTokens, textOf } from '@/core/agent/session/session-utils';
import { sessions } from '@/core/agent/session/sessions';
import { GenUIView } from '@/genui/view';
import { checkSpec } from '@/genui/check';
import { radius, springs, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { composerDraft } from './composer/draft';

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
  if (message.role === 'event') return <EventRow message={message} />;
  if (message.role === 'user') return <UserBubble message={message} />;
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
      {!streaming && (message.parts.length > 0 || message.meta?.ended === 'stopped' || message.meta?.ended === 'error') ? <ReplyActions message={message} last={last} onRegenerate={onRegenerate} /> : null}
    </View>
  );
}, (a, b) => a.message === b.message && a.streaming === b.streaming && a.last === b.last);

const TONE_ICON: Record<'info' | 'success' | 'warn' | 'error', { icon: IconName; tone: TextTone }> = {
  info: { icon: 'sparkles', tone: 'muted' },
  success: { icon: 'check', tone: 'up' },
  warn: { icon: 'warning', tone: 'warn' },
  error: { icon: 'warning', tone: 'down' },
};

/** UI-only rows: command/harness notices and compaction markers. The model never sees these. */
function EventRow({ message }: { message: ChatMessage }) {
  return (
    <View className="gap-2">
      {message.parts.map((p, i) =>
        p.type === 'notice' ? <Notice key={i} part={p} /> : p.type === 'compaction' ? <CompactionMarker key={i} part={p} /> : null,
      )}
    </View>
  );
}

function Notice({ part }: { part: Extract<ChatPart, { type: 'notice' }> }) {
  const c = useTheme();
  const t = TONE_ICON[part.tone];
  const color = t.tone === 'muted' ? c.textFaint : c[t.tone === 'up' ? 'up' : t.tone === 'warn' ? 'warn' : 'down'];
  return (
    <FadeIn>
      <View className="flex-row items-start justify-center gap-1.5 px-6" accessibilityRole="text">
        <Icon name={t.icon} size={14} color={color} style={{ marginTop: 1 }} />
        <Text variant="caption" tone={t.tone === 'muted' ? 'muted' : t.tone} align="center" className="shrink">
          {part.text}
        </Text>
      </View>
    </FadeIn>
  );
}

/** "已压缩 32 条消息 · 18.2k → 2.1k tokens"; tap shows the summary that replaced them. */
function CompactionMarker({ part }: { part: Extract<ChatPart, { type: 'compaction' }> }) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-2">
      <Pressable
        onPress={() => {
          haptics.select();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`已压缩 ${part.compactedMessages} 条消息，${open ? '收起' : '展开'}摘要`}
        className="flex-row items-center gap-2 py-1">
        <View className="h-[0.5px] flex-1 bg-edge" />
        <Text variant="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
          已压缩 {part.compactedMessages} 条消息 · {formatTokens(part.tokensBefore)} → {formatTokens(part.tokensAfter)} tokens
        </Text>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} color={c.textFaint} />
        <View className="h-[0.5px] flex-1 bg-edge" />
      </Pressable>
      {open ? (
        <Animated.View entering={Appear.duration(160)} exiting={FadeOut.duration(120)}>
          <Surface level={1}>
            <Markdown text={part.summary} />
          </Surface>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The user's message: attachments above the text; long-press for 编辑 / 复制. */
function UserBubble({ message }: { message: ChatMessage }) {
  const [menu, setMenu] = useState(false);
  const text = textOf(message);
  const attachments = message.parts.filter((p): p is AttachmentPart => p.type === 'attachment');
  const images = attachments.filter((a) => a.kind === 'image' && a.uri);
  const files = attachments.filter((a) => !(a.kind === 'image' && a.uri));
  return (
    <View className="items-end gap-2">
      <Animated.View entering={bubbleIn} className="max-w-[85%] items-end gap-2" style={{ transformOrigin: 'right bottom' }}>
        {images.length ? <ImageGrid images={images} /> : null}
        {files.length ? (
          <View className="flex-row flex-wrap justify-end gap-1.5">
            {files.map((a) => (
              <AttachmentChip key={a.id} attachment={a} />
            ))}
          </View>
        ) : null}
        {text ? (
          <Pressable
            onLongPress={() => {
              haptics.select();
              setMenu((m) => !m);
            }}
            delayLongPress={350}
            accessibilityHint="长按编辑或复制"
            className="rounded-lg rounded-br-sm border-[0.5px] border-edge bg-accent-muted px-4 py-3"
            style={{ borderCurve: 'continuous' }}>
            <Text variant="body">{text}</Text>
          </Pressable>
        ) : (
          <Pressable onLongPress={() => setMenu((m) => !m)} accessibilityLabel="附件消息，长按编辑" className="px-1">
            <Text variant="caption" tone="faint">
              长按编辑
            </Text>
          </Pressable>
        )}
      </Animated.View>
      {menu ? (
        <Animated.View entering={Appear.duration(140)} exiting={FadeOut.duration(100)} className="flex-row gap-2">
          <Button
            title="编辑"
            icon="edit"
            size="sm"
            variant="secondary"
            onPress={() => {
              setMenu(false);
              sessions.startEdit(message.id);
              composerDraft.put({ text, attachments });
            }}
          />
          {text ? (
            <Button
              title="复制"
              icon="copy"
              size="sm"
              variant="secondary"
              onPress={() => {
                setMenu(false);
                void Clipboard.setStringAsync(text);
                haptics.success();
              }}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Sent images: one at its own aspect, several in a 2-column grid. */
/** Grid width (dp) of sent images; explicit sizes because expo-image on Android leaves percentage-sized views blank. */
const GRID_W = 256;
const GRID_GAP = 4;

function ImageGrid({ images }: { images: AttachmentPart[] }) {
  const single = images.length === 1;
  const cell = (GRID_W - GRID_GAP) / 2;
  return (
    <View className="flex-row flex-wrap justify-end" style={{ width: GRID_W, gap: GRID_GAP }}>
      {images.map((a) => {
        // Portrait shots are cropped to 3:4 (cover) so one image never fills half the screen.
        const ratio = single && a.width && a.height ? Math.max(0.75, Math.min(1.8, a.width / a.height)) : 1;
        const w = single ? GRID_W : cell;
        return (
          <Image
            key={a.id}
            source={{ uri: a.uri }}
            contentFit="cover"
            transition={160}
            accessibilityLabel={a.name}
            style={{ width: w, height: w / ratio, borderRadius: radius.md, borderCurve: 'continuous' }}
          />
        );
      })}
    </View>
  );
}

function AttachmentChip({ attachment: a }: { attachment: AttachmentPart }) {
  const c = useTheme();
  const size = a.kind === 'text' ? `${a.size.toLocaleString('en-US')} 字` : `${Math.max(1, Math.round(a.size / 1024))} KB`;
  return (
    <View className="max-w-60 flex-row items-center gap-1.5 rounded-sm border-[0.5px] border-edge bg-surface-2 px-2 py-1" style={{ borderCurve: 'continuous' }}>
      <Icon name={a.kind === 'text' ? 'book' : 'puzzle'} size={14} color={c.textMuted} />
      <Text variant="caption" numberOfLines={1} className="shrink">
        {a.name}
      </Text>
      <Text variant="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
        {size}
      </Text>
    </View>
  );
}
