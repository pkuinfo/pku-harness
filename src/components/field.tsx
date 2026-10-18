import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, typography, useTheme } from '@/theme';

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
  const ring = error ? c.down : focused ? c.accent : c.border;
  return (
    <View style={styles.wrap}>
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
        style={[
          typography.body,
          styles.input,
          { color: c.text, backgroundColor: c.surface2, borderColor: ring },
          style,
        ]}
      />
      {error || hint ? (
        <Text variant="caption" tone={error ? 'down' : 'faint'}>
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
});
