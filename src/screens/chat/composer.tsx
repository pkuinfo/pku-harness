import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { IconButton } from '@/components/button';
import { typography, useTheme } from '@/theme';
import { cx } from '@/utils/cx';

export function Composer({
  busy,
  onSend,
  onStop,
  glass = false,
}: {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Over the hero backdrop: a glass box instead of a solid one. */
  glass?: boolean;
}) {
  const c = useTheme();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !busy;
  return (
    <View className="px-3 py-2">
      <View
        className={cx('flex-row items-end gap-2 rounded-lg border-[0.5px] border-edge py-1.5 pl-4 pr-1.5', glass ? 'bg-surface' : 'bg-surface-2')}
        style={{ borderCurve: 'continuous' }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="问点什么，或让我帮你做点什么…"
          placeholderTextColor={c.textFaint}
          selectionColor={c.accent}
          multiline
          className="max-h-36 flex-1 py-2 text-fg"
          style={typography.body}
          accessibilityLabel="消息输入框"
        />
        {busy ? (
          <IconButton icon="stop" label="停止生成" variant="secondary" size={36} onPress={onStop} />
        ) : (
          <IconButton
            icon="send"
            label="发送"
            variant="primary"
            size={36}
            disabled={!canSend}
            onPress={() => {
              onSend(text);
              setText('');
            }}
          />
        )}
      </View>
    </View>
  );
}
