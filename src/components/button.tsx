import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type ThemeColors } from '@/theme';
import { cx } from '@/utils/cx';

import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';
import { Text, type TextTone } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

// Primary is solid 北大红 with a lit top edge; secondary is glass with a hairline edge.
const SURFACE: Record<Variant, string> = {
  primary: 'bg-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
  secondary: 'bg-surface-2 border-[0.5px] border-edge',
  ghost: 'bg-transparent',
  danger: 'bg-down-muted',
};
const TONE: Record<Variant, TextTone> = { primary: 'onAccent', secondary: 'default', ghost: 'default', danger: 'down' };
const FG: Record<Variant, keyof ThemeColors> = { primary: 'onBrand', secondary: 'text', ghost: 'text', danger: 'down' };
const SIZE: Record<Size, { box: string; row: string; icon: number }> = {
  sm: { box: 'min-h-8 px-3', row: 'gap-1', icon: 16 },
  md: { box: 'min-h-11 px-4', row: 'gap-2', icon: 18 },
  lg: { box: 'min-h-13 px-6', row: 'gap-2', icon: 20 },
};
const CURVE = { borderCurve: 'continuous' } as const;

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  style,
  className,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const fg = useTheme()[FG[variant]];
  const s = SIZE[size];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={cx('items-center justify-center rounded-md', SURFACE[variant], s.box, disabled && 'opacity-40', className)}
      style={[CURVE, style]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View className={cx('flex-row items-center', s.row)}>
          {icon ? <Icon name={icon} size={s.icon} color={fg} /> : null}
          <Text variant={size === 'sm' ? 'callout' : 'bodyStrong'} tone={TONE[variant]}>
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  variant = 'secondary',
  size = 40,
  disabled,
  style,
  className,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const fg = useTheme()[FG[variant]];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.92}
      className={cx('items-center justify-center rounded-md', SURFACE[variant], disabled && 'opacity-40', className)}
      style={[CURVE, { width: size, height: size }, style]}>
      <Icon name={icon} size={Math.round(size * 0.48)} color={fg} />
    </PressableScale>
  );
}
