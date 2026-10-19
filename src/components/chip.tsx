import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type ThemeColors } from '@/theme';
import { cx } from '@/utils/cx';

import { Icon, type IconName } from './icon';
import { Text, type TextTone } from './text';

export type ChipTone = 'neutral' | 'accent' | 'up' | 'down' | 'warn' | 'info';

const BG: Record<ChipTone, string> = {
  neutral: 'bg-surface-3',
  accent: 'bg-accent-muted',
  up: 'bg-up-muted',
  down: 'bg-down-muted',
  warn: 'bg-warn-muted',
  info: 'bg-info-muted',
};
const TEXT: Record<ChipTone, TextTone> = { neutral: 'muted', accent: 'accent', up: 'up', down: 'down', warn: 'warn', info: 'info' };
const ICON: Record<ChipTone, keyof ThemeColors> = { neutral: 'textMuted', accent: 'accent', up: 'up', down: 'down', warn: 'warn', info: 'info' };

/** Small status label. Pair colour with an icon or text, never colour alone. */
export function Chip({ label, tone = 'neutral', icon, style, className }: { label: string; tone?: ChipTone; icon?: IconName; style?: StyleProp<ViewStyle>; className?: string }) {
  const c = useTheme();
  return (
    <View className={cx('flex-row items-center self-start gap-1 rounded-sm px-2 py-[3px]', BG[tone], className)} style={[{ borderCurve: 'continuous' }, style]}>
      {icon ? <Icon name={icon} size={12} color={c[ICON[tone]]} /> : null}
      <Text variant="micro" tone={TEXT[tone]}>
        {label}
      </Text>
    </View>
  );
}
