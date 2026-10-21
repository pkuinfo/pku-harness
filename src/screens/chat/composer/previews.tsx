import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { Text } from '@/components/text';
import type { AttachmentPart } from '@/core/agent/session/chat-store';
import { useT } from '@/i18n';
import { spacing, springs, useTheme } from '@/theme';

import { textChipLines } from './attachment-tray';

/** Full-screen layer over everything (edge to edge, back button closes). */
function FullScreen({ visible, onClose, animation, children }: { visible: boolean; onClose: () => void; animation: 'fade' | 'slide'; children: ReactNode }) {
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType={animation} transparent={animation === 'fade'} statusBarTranslucent navigationBarTranslucent>
      {children}
    </Modal>
  );
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Tap a tray thumbnail → the image full screen, with its size and 移除. */
export function ImagePreview({ image, onClose, onRemove }: { image: AttachmentPart | null; onClose: () => void; onRemove: (a: AttachmentPart) => void }) {
  const insets = useSafeAreaInsets();
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  return (
    <FullScreen visible={!!image} onClose={onClose} animation="fade">
      <View className="flex-1 bg-bg">
        {image ? (
          <Animated.View
            entering={reduced ? FadeIn : ZoomIn.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness)}
            className="flex-1">
            <Image source={{ uri: image.uri }} contentFit="contain" style={StyleSheet.absoluteFill} accessibilityLabel={image.name} />
          </Animated.View>
        ) : null}
        <View className="absolute left-0 right-0 flex-row items-center justify-end px-4" style={{ top: insets.top + spacing.sm }}>
          <IconButton icon="close" label={t('chat.attach.closePreview')} variant="secondary" onPress={onClose} style={{ backgroundColor: c.elevated }} />
        </View>
        {image ? (
          <View
            className="absolute left-4 right-4 flex-row items-center gap-3 rounded-lg border-[0.5px] border-edge bg-elevated p-3"
            style={{ bottom: Math.max(insets.bottom, spacing.lg), borderCurve: 'continuous' }}>
            <View className="flex-1 gap-0.5">
              <Text variant="callout" numberOfLines={1}>
                {image.name}
              </Text>
              <Text variant="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                {image.width && image.height ? `${image.width} × ${image.height} · ` : ''}
                {formatBytes(image.size)}
              </Text>
            </View>
            <Button title={t('chat.attach.remove')} icon="trash" variant="danger" size="sm" onPress={() => onRemove(image)} />
          </View>
        ) : null}
      </View>
    </FullScreen>
  );
}

/**
 * Tap a text chip → the whole text (§4.3). Pasted text offers 移回输入框 (back into the draft)
 * and 删除; a text file offers 删除.
 */
export function TextPreview({
  item,
  onClose,
  onRemove,
  onRestore,
}: {
  item: AttachmentPart | null;
  onClose: () => void;
  onRemove: (a: AttachmentPart) => void;
  onRestore?: (a: AttachmentPart) => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const lines = item ? textChipLines(item, t) : null;
  return (
    <FullScreen visible={!!item} onClose={onClose} animation="slide">
      <View className="flex-1 bg-bg">
        <View className="flex-row items-center gap-3 border-b-[0.5px] border-edge px-4 pb-3" style={{ paddingTop: insets.top + spacing.sm }}>
          <View className="flex-1 gap-0.5">
            <Text variant="headline" numberOfLines={1}>
              {lines?.name ?? ''}
            </Text>
            <Text variant="caption" tone="faint" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
              {lines?.stats ?? ''}
            </Text>
          </View>
          <IconButton icon="close" label={t('core.common.close')} variant="ghost" onPress={onClose} />
        </View>
        <ScrollView className="flex-1" contentContainerClassName="p-4">
          <Text variant="body" selectable>
            {item?.text ?? ''}
          </Text>
        </ScrollView>
        {item ? (
          <View className="flex-row gap-2 border-t-[0.5px] border-edge px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, spacing.md) }}>
            <Button title={t('core.common.delete')} icon="trash" variant="danger" onPress={() => onRemove(item)} className="flex-1" />
            {onRestore ? <Button title={t('chat.attach.restore')} icon="undo" onPress={() => onRestore(item)} className="flex-2" /> : null}
          </View>
        ) : null}
      </View>
    </FullScreen>
  );
}

/** ⤢ → a full-screen editor for long drafts (§4.3); edits the draft live, 完成 returns. */
export function FullEditor({ visible, onClose, children, counter }: { visible: boolean; onClose: () => void; children: ReactNode; counter: ReactNode }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  return (
    <FullScreen visible={visible} onClose={onClose} animation="slide">
      <KeyboardAvoidingView className="flex-1 bg-bg" behavior="padding">
        <View className="flex-row items-center gap-3 px-4 pb-2" style={{ paddingTop: insets.top + spacing.sm }}>
          <Text variant="headline" className="flex-1">
            {t('chat.composer.editMessage')}
          </Text>
          {counter}
          <Button title={t('core.common.done')} size="sm" onPress={onClose} />
        </View>
        <View className="flex-1 px-4" style={{ paddingBottom: Math.max(insets.bottom, spacing.md) }}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </FullScreen>
  );
}
