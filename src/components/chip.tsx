import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme, type ThemeColors } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text, type TextTone } from './text';

export type ChipTone = 'neutral' | 'accent' | 'up' | 'down' | 'warn' | 'info';

const toneMap = (c: ThemeColors): Record<ChipTone, { bg: string; fg: string; text: TextTone }> => ({
  neutral: { bg: c.surface3, fg: c.textMuted, text: 'muted' },
  accent: { bg: c.accentMuted, fg: c.accent, text: 'accent' },
  up: { bg: c.upMuted, fg: c.up, text: 'up' },
  down: { bg: c.downMuted, fg: c.down, text: 'down' },
  warn: { bg: c.warnMuted, fg: c.warn, text: 'warn' },
  info: { bg: c.infoMuted, fg: c.info, text: 'info' },
});

/** Small status label. Pair colour with an icon or text, never colour alone. */
export function Chip({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: ChipTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const t = toneMap(useTheme())[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }, style]}>
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
      <Text variant="micro" tone={t.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radius.full,
  },
});
