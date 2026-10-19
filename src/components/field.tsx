import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { typography, useTheme } from '@/theme';
import { cx } from '@/utils/cx';

import { IconButton } from './button';
import { Text } from './text';

/** Labelled text input with hint/error, an accent focus ring and an optional trailing accessory. */
export function Field({
  label,
  hint,
  error,
  style,
  trailing,
  ...input
}: TextInputProps & { label?: string; hint?: string; error?: string; trailing?: ReactNode }) {
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
      <View className={cx('min-h-12 flex-row items-center rounded-md border bg-surface-2', ring, trailing ? 'pr-1' : undefined)} style={{ borderCurve: 'continuous' }}>
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
          className="min-h-12 flex-1 px-4 text-fg"
          style={[typography.body, style]}
        />
        {trailing}
      </View>
      {error || hint ? (
        <Text variant="caption" tone={error ? 'down' : 'faint'}>
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A secret (password, API key): masked by default, with a show/hide eye. */
export function SecretField(props: Omit<TextInputProps, 'secureTextEntry'> & { label?: string; hint?: string; error?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <Field
      {...props}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={<IconButton icon={shown ? 'eyeOff' : 'eye'} label={shown ? '隐藏' : '显示'} variant="ghost" size={40} onPress={() => setShown((s) => !s)} />}
    />
  );
}
