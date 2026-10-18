import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { IconButton } from '@/components/button';
import { radius, spacing, typography, useTheme } from '@/theme';

export function Composer({
  busy,
  onSend,
  onStop,
}: {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const c = useTheme();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !busy;
  return (
    <View style={[styles.wrap, { backgroundColor: c.bg }]}>
      <View style={[styles.box, { backgroundColor: c.surface2, borderColor: c.border }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="问点什么，或让我帮你做点什么…"
          placeholderTextColor={c.textFaint}
          selectionColor={c.accent}
          multiline
          style={[typography.body, styles.input, { color: c.text }]}
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

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
  },
  input: { flex: 1, maxHeight: 140, paddingVertical: spacing.sm },
});
