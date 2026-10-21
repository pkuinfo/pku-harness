import { Image } from 'expo-image';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import type { AttachmentPart } from '@/core/agent/session/chat-store';
import { t as translateNow, useT } from '@/i18n';
import { radius, spacing, springs, useTheme } from '@/theme';

import { firstLine, pasteLabel, textStats, type Tr } from './logic';

const CURVE = { borderCurve: 'continuous' } as const;
/** 56 px thumbnails (§4.2). */
const THUMB = spacing.xxxl + spacing.sm;
const styles = StyleSheet.create({ thumb: { width: THUMB, height: THUMB, borderRadius: radius.md, borderCurve: 'continuous' } });
/**
 * Pasted text becomes an attachment named in the app language at paste time (the model sees
 * that name); it is recognised by either language's name, so it shows in the current one.
 */
const PASTE_NAMES = new Set(['粘贴的文本', 'Pasted text']);
export const pasteName = () => translateNow('chat.attach.pasted');
export const isPastedText = (name: string) => PASTE_NAMES.has(name);

/** Title and subtitle of a text attachment chip (§4.3: "粘贴的文本 · 3,214 字 · 86 行"), plus its stats. */
export function textChipLines(a: AttachmentPart, tr: Tr): { title: string; subtitle: string; name: string; stats: string } {
  const text = a.text ?? '';
  const stats = textStats(text, tr);
  if (isPastedText(a.name)) return { title: pasteLabel(text, tr), subtitle: firstLine(text) || tr('chat.attach.blank'), name: tr('chat.attach.pasted'), stats };
  return { title: a.name, subtitle: stats, name: a.name, stats };
}

function RemoveBadge({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      scaleTo={0.85}
      className="absolute -right-1.5 -top-1.5 size-5 items-center justify-center rounded-full border-[0.5px] border-edge bg-elevated">
      <Icon name="close" size={11} color={c.text} />
    </PressableScale>
  );
}

/**
 * The tray at the top of the composer box (§4.2): 56 px image thumbnails and text chips, each
 * with a ✕; tapping opens the full-screen preview. `pending` = images still being processed.
 */
export function AttachmentTray({
  items,
  pending,
  onOpen,
  onRemove,
}: {
  items: AttachmentPart[];
  pending: number;
  onOpen: (a: AttachmentPart) => void;
  onRemove: (a: AttachmentPart) => void;
}) {
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const enter = reduced ? FadeIn : ZoomIn.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness);
  const exit = reduced ? FadeOut : ZoomOut;
  const layout = reduced ? undefined : LinearTransition.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2 px-3 pb-1 pt-3">
      {items.map((a) =>
        a.kind === 'image' ? (
          <Animated.View key={a.id} entering={enter} exiting={exit} layout={layout}>
            <PressableScale accessibilityRole="imagebutton" accessibilityLabel={t('chat.attach.viewImage', { name: a.name })} onPress={() => onOpen(a)}>
              <Image source={{ uri: a.uri }} contentFit="cover" transition={120} style={[styles.thumb, { backgroundColor: c.surface3 }]} />
            </PressableScale>
            <RemoveBadge label={t('chat.attach.removeImage', { name: a.name })} onPress={() => onRemove(a)} />
          </Animated.View>
        ) : (
          <Animated.View key={a.id} entering={enter} exiting={exit} layout={layout}>
            <TextChip attachment={a} onPress={() => onOpen(a)} />
            <RemoveBadge label={t('chat.attach.removeItem', { name: textChipLines(a, t).name })} onPress={() => onRemove(a)} />
          </Animated.View>
        ),
      )}
      {Array.from({ length: pending }, (_, i) => (
        <Animated.View key={`pending-${i}`} entering={FadeIn} exiting={FadeOut} layout={layout}>
          <View className="size-14 items-center justify-center rounded-md bg-surface-3" style={CURVE} accessibilityLabel={t('chat.attach.processing')}>
            <ActivityIndicator size="small" color={c.textMuted} />
          </View>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

function TextChip({ attachment, onPress }: { attachment: AttachmentPart; onPress: () => void }) {
  const c = useTheme();
  const t = useT();
  const { title, subtitle } = textChipLines(attachment, t);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('chat.attach.previewHint', { title })}
      onPress={onPress}
      className="h-14 w-48 flex-row items-center gap-2 rounded-md bg-surface-3 pl-2 pr-3"
      style={CURVE}>
      <View className="size-9 items-center justify-center rounded-sm bg-surface-2" style={CURVE}>
        <Icon name="fileText" size={18} color={c.textMuted} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="caption" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
          {title}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </PressableScale>
  );
}
