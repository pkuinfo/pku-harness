import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

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
  const c = useTheme();
  const items = Children.toArray(children);
  return (
    <View style={[{ gap: spacing.sm }, style]}>
      {title ? (
        <Text variant="micro" tone="faint" style={styles.title}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.group, { backgroundColor: c.surface }]}>
        {items.map((child, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={[styles.hairline, { backgroundColor: c.border }]} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="caption" tone="faint" style={styles.title}>
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
}: {
  icon?: IconName;
  iconTint?: string;
  title: string;
  subtitle?: string;
  value?: string;
  accessory?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const c = useTheme();
  const content = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: c.surface3 }]}>
          <Icon name={icon} size={18} color={iconTint ?? c.text} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text variant="body" numberOfLines={1}>
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
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
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

const styles = StyleSheet.create({
  title: { paddingHorizontal: spacing.lg },
  group: { borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg + 32 + spacing.md },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing.xxs },
  accessory: { alignSelf: 'center' },
});
