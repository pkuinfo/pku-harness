import { View } from 'react-native';

import { useTheme, type TypographyVariant } from '@/theme';

import { AnimatedNumber } from './animated-number';
import { Chip, type ChipTone } from './chip';
import { Icon, type IconName } from './icon';
import { formatStat, statDecimals } from './stat-format';
import { Text } from './text';

/** Label + hero number + optional delta chip. Building block of dashboard widgets. */
export function Stat({
  label,
  icon,
  value,
  prefix = '',
  suffix = '',
  decimals,
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
  /** Default: two for money, none for whole numbers (see statDecimals). */
  decimals?: number;
  size?: TypographyVariant;
  delta?: string;
  deltaTone?: ChipTone;
  caption?: string;
}) {
  const c = useTheme();
  return (
    <View className="gap-1">
      {/* Same quiet label as plugin widgets: the number is the hero. */}
      <View className="flex-row items-center gap-1">
        {icon ? <Icon name={icon} size={12} color={c.textFaint} /> : null}
        <Text variant="micro" tone="faint">
          {label}
        </Text>
      </View>
      {typeof value === 'number' && Number.isFinite(value) ? (
        <AnimatedNumber value={value} variant={size} format={(n) => formatStat(n, { prefix, suffix, decimals: decimals ?? statDecimals(value, prefix, suffix) })} />
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
