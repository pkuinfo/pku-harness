import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme, type ThemeColors } from '@/theme';

import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';
import { Text, type TextTone } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variantStyle = (c: ThemeColors): Record<Variant, { bg: string; tone: TextTone; fg: string; edge?: string }> => ({
  // Primary is solid 北大红 with a lit top edge; secondary is glass with a hairline edge.
  primary: { bg: c.brand, tone: 'onAccent', fg: c.onBrand, edge: 'inset 0 1px 0 rgba(255, 255, 255, 0.2)' },
  secondary: { bg: c.surface2, tone: 'default', fg: c.text },
  ghost: { bg: 'transparent', tone: 'default', fg: c.text },
  danger: { bg: c.downMuted, tone: 'down', fg: c.down },
});

const sizeStyle: Record<Size, ViewStyle & { icon: number }> = {
  sm: { minHeight: 32, paddingHorizontal: spacing.md, gap: spacing.xs, icon: 16 },
  md: { minHeight: 44, paddingHorizontal: spacing.lg, gap: spacing.sm, icon: 18 },
  lg: { minHeight: 52, paddingHorizontal: spacing.xl, gap: spacing.sm, icon: 20 },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useTheme();
  const v = variantStyle(colors)[variant];
  const { icon: iconSize, ...s } = sizeStyle[size];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.base, s, { backgroundColor: v.bg, boxShadow: v.edge, opacity: disabled ? 0.4 : 1 }, variant === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, style]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={[styles.row, { gap: s.gap }]}>
          {icon ? <Icon name={icon} size={iconSize} color={v.fg} /> : null}
          <Text variant={size === 'sm' ? 'callout' : 'bodyStrong'} tone={v.tone}>
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
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useTheme();
  const v = variantStyle(colors)[variant];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.92}
      style={[
        styles.iconBtn,
        { width: size, height: size, backgroundColor: v.bg, boxShadow: v.edge, opacity: disabled ? 0.4 : 1 },
        variant === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        style,
      ]}>
      <Icon name={icon} size={Math.round(size * 0.48)} color={v.fg} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
});
