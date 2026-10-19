import { View } from 'react-native';

import type { TypographyVariant } from '@/theme';

import { AnimatedNumber } from './animated-number';
import { Chip, type ChipTone } from './chip';
import { Icon, type IconName } from './icon';
import { Text } from './text';

/** Label + hero number + optional delta chip. Building block of dashboard widgets. */
export function Stat({
  label,
  icon,
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  size = 'numberL',
  delta,
  deltaTone,
  caption,
}: {
  label: string;
  icon?: IconName;
  /** null/NaN renders an em dash (data not available). */
  value: number | null;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  size?: TypographyVariant;
  delta?: string;
  deltaTone?: ChipTone;
  caption?: string;
}) {
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-1">
        {icon ? <Icon name={icon} size={14} /> : null}
        <Text variant="callout" tone="muted">
          {label}
        </Text>
      </View>
      {typeof value === 'number' && Number.isFinite(value) ? (
        <AnimatedNumber value={value} variant={size} format={(n) => `${prefix}${n.toFixed(decimals)}${suffix}`} />
      ) : (
        <Text variant={size} tone="faint">
          —
        </Text>
      )}
      {delta || caption ? (
        <View className="flex-row items-center gap-1">
          {delta ? (
            <Chip
              label={delta}
              tone={deltaTone ?? 'neutral'}
              icon={deltaTone === 'up' ? 'trendUp' : deltaTone === 'down' ? 'trendDown' : undefined}
            />
          ) : null}
          {caption ? (
            <Text variant="caption" tone="faint">
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
