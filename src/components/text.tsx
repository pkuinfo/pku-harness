import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { typography, useTheme, type ThemeColors, type TypographyVariant } from '@/theme';

export type TextTone = 'default' | 'muted' | 'faint' | 'accent' | 'up' | 'down' | 'warn' | 'info' | 'onAccent';

const toneKey: Record<TextTone, keyof ThemeColors> = {
  default: 'text',
  muted: 'textMuted',
  faint: 'textFaint',
  accent: 'accent',
  up: 'up',
  down: 'down',
  warn: 'warn',
  info: 'info',
  onAccent: 'onAccent',
};

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
};

/** The only way to render text. Size from `variant`, colour from `tone`. */
export function Text({ variant = 'body', tone = 'default', align, style, ...props }: TextProps) {
  const colors = useTheme();
  return (
    <RNText
      style={[typography[variant], { color: colors[toneKey[tone]], textAlign: align }, style]}
      {...props}
    />
  );
}
