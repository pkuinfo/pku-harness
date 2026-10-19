import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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
}: {
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
      <View className="overflow-hidden rounded-lg bg-surface" style={{ borderCurve: 'continuous' }}>
        <GlassEdges radius={radius.lg} />
        {items.map((child, i) => (
          <Fragment key={i}>
            {/* Inset under the text, past the 32 px icon well. */}
            {i > 0 ? <View className="ml-[60px] bg-edge" style={{ height: StyleSheet.hairlineWidth }} /> : null}
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
  icon,
  iconTint,
  title,
  subtitle,
  value,
  accessory,
  onPress,
  chevron,
  titleLines = 1,
}: {
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
    <View className="min-h-14 flex-row items-center gap-3 px-4 py-3">
      {icon ? (
        <View className="h-8 w-8 items-center justify-center rounded-md bg-surface-3" style={{ borderCurve: 'continuous' }}>
          <Icon name={icon} size={18} color={iconTint ?? c.text} />
        </View>
      ) : null}
      <View className="flex-1 gap-0.5">
        <Text variant="body" numberOfLines={titleLines}>
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
