import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { typography, useTheme } from '@/theme';
import { cx } from '@/utils/cx';

import { Text } from './text';

/** Labelled text input with hint/error and an accent focus ring. */
export function Field({
  label,
  hint,
  error,
  style,
  ...input
}: TextInputProps & { label?: string; hint?: string; error?: string }) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  const ring = error ? 'border-down' : focused ? 'border-accent' : 'border-edge';
  return (
    <View className="gap-1">
      {label ? (
        <Text variant="callout" tone="muted">
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={c.textFaint}
        selectionColor={c.accent}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        className={cx('min-h-12 rounded-md border bg-surface-2 px-4 text-fg', ring)}
        style={[typography.body, { borderCurve: 'continuous' }, style]}
      />
      {error || hint ? (
        <Text variant="caption" tone={error ? 'down' : 'faint'}>
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}
