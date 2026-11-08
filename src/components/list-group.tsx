import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { cx } from '@/utils/cx';

import { radius, useTheme } from '@/theme';

import { GlassEdges } from './glass';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

/** Grouped rows separated by hairlines (settings-style). */
export function ListGroup({
  title,
  footer,
  children,
  style,
  variant = 'grouped',
}: {
  variant?: 'grouped' | 'plain';
  title?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children);
  return (
    <View className="gap-2" style={style}>
      {title ? (
        <Text variant="micro" tone="faint" className="px-4">
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View className={cx("overflow-hidden", variant === 'grouped' && "rounded-lg bg-surface")} style={{ borderCurve: 'continuous' }}>
        {variant === 'grouped' ? <GlassEdges radius={radius.lg} /> : null}
        {items.map((child, i) => (
          <Fragment key={i}>
            {/* Inset under the text, past the 32 px icon well. */}
            {i > 0 ? <View className={cx('bg-edge', variant === 'grouped' && 'ml-[60px]')} style={{ height: StyleSheet.hairlineWidth }} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="caption" tone="faint" className="px-4">
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export function ListRow({
  leading,
  icon,
  iconTint,
  title,
  subtitle,
  value,
  accessory,
  onPress,
  chevron,
  titleLines = 1,
  compact = false,
}: {
  compact?: boolean;
  leading?: ReactNode;
  icon?: IconName;
  iconTint?: string;
  title: string;
  subtitle?: string;
  value?: string;
  accessory?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  /** Lines before the title truncates (long content rows like memories). */
  titleLines?: number;
}) {
  const c = useTheme();
  const content = (
    <View className={cx('min-h-14 flex-row items-center gap-3', compact ? 'py-1' : 'px-4 py-3')}>
      {leading ?? (icon ? (
        <View className="h-8 w-8 items-center justify-center rounded-md bg-surface-3" style={{ borderCurve: 'continuous' }}>
          <Icon name={icon} size={18} color={iconTint ?? c.text} />
        </View>
      ) : null)}
      <View className="flex-1 gap-0.5">
        <Text variant={compact ? "callout" : "body"} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="callout" tone="muted" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {accessory ? <View className="self-center">{accessory}</View> : null}
      {chevron ?? !!onPress ? <Icon name="chevronRight" size={16} color={c.textFaint} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={title} onPress={onPress} scaleTo={0.985}>
      {content}
    </PressableScale>
  );
}
