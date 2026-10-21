import { BottomSheet, RNHostView } from '@expo/ui';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { libraryPickLimit, MAX_ATTACHMENTS, remainingSlots } from '@/core/agent/attachments/attachment-rules';
import { spacing, useTheme } from '@/theme';
import { cx } from '@/utils/cx';

export type AttachAction = 'camera' | 'library' | 'files' | 'command';

const CURVE = { borderCurve: 'continuous' } as const;

function Row({ icon, title, detail, disabled, onPress }: { icon: IconName; title: string; detail: string; disabled?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cx('flex-row items-center gap-3 rounded-md px-2 py-2.5', disabled && 'opacity-40')}
      style={CURVE}>
      <View className="size-10 items-center justify-center rounded-md bg-surface-3" style={CURVE}>
        <Icon name={icon} size={20} color={c.text} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </PressableScale>
  );
}

/**
 * `+` → 拍照 / 相册 / 文件 / 输入命令 (§4.2), as a native bottom sheet (@expo/ui). Image rows are
 * disabled when the session's model doesn't take images, with a one-tap switch to one that does.
 */
export function AttachSheet({
  open,
  onClose,
  onPick,
  count,
  images,
  suggestion,
  onSwitchModel,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (action: AttachAction) => void;
  /** Attachments already in the draft. */
  count: number;
  /** The session's model takes images. */
  images: boolean;
  /** A ready model that does take images (shown in the hint). */
  suggestion: string | null;
  onSwitchModel: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const left = remainingSlots(count);
  const full = left === 0;
  const fullDetail = `已达到 ${MAX_ATTACHMENTS} 个附件上限`;
  const imageDetail = (ok: string) => (!images ? '当前模型不支持图片' : full ? fullDetail : ok);
  return (
    <BottomSheet isPresented={open} onDismiss={onClose} containerColor={c.elevated} contentPadding={{ left: 0, right: 0, top: 0, bottom: 0 }}>
      <RNHostView matchContents>
        <View className="gap-1 px-3 pt-1" style={{ paddingBottom: Math.max(insets.bottom, spacing.lg) }}>
          <Text variant="micro" tone="faint" className="px-2 pb-1">
            添加到消息{count ? ` · 还能添加 ${left} 个` : ''}
          </Text>
          {!images ? (
            <View className="mx-2 mb-1 flex-row items-center gap-3 rounded-md bg-warn-muted px-3 py-2.5" style={CURVE}>
              <Icon name="image" size={16} color={c.warn} />
              <Text variant="caption" tone="warn" className="flex-1">
                {suggestion ? `当前模型不支持图片（可切换到 ${suggestion}）` : '当前模型不支持图片'}
              </Text>
              {suggestion ? <Button title="切换" size="sm" variant="secondary" onPress={onSwitchModel} /> : null}
            </View>
          ) : null}
          <Row icon="camera" title="拍照" detail={imageDetail('用相机拍一张')} disabled={!images || full} onPress={() => onPick('camera')} />
          <Row
            icon="photos"
            title="相册"
            detail={imageDetail(`一次最多选 ${libraryPickLimit(count)} 张`)}
            disabled={!images || full}
            onPress={() => onPick('library')}
          />
          <Row icon="file" title="文件" detail={full ? fullDetail : 'txt、md、csv、json、log，200 KB 以内'} disabled={full} onPress={() => onPick('files')} />
          <Row icon="command" title="输入命令" detail="输入 / 打开命令菜单" onPress={() => onPick('command')} />
        </View>
      </RNHostView>
    </BottomSheet>
  );
}
