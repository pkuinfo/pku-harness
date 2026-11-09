import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useT } from '@/i18n';
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
}: TextInputProps & { label?: string; hint?: string; error?: string; trailing?: ReactNode; ref?: Ref<ComponentRef<typeof TextInput>> }) {
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
      <View className={cx('min-h-12 flex-row items-center rounded-md dark:rounded-lg border bg-surface-2', ring, trailing ? 'pr-1' : undefined)} style={{ borderCurve: 'continuous' }}>
        <TextInput
          placeholderTextColor={c.textFaint}
          selectionColor={c.accent}
          // TalkBack reads the visible label (a sibling Text) and the hint, not just the placeholder.
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
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
          style={[typography.callout, style]}
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
export function SecretField(props: Omit<TextInputProps, 'secureTextEntry'> & { label?: string; hint?: string; error?: string; ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <Field
      {...props}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={<IconButton icon={shown ? 'eyeOff' : 'eye'} label={shown ? t('app.ui.hide') : t('app.ui.show')} variant="ghost" size={40} onPress={() => setShown((s) => !s)} />}
    />
  );
}
