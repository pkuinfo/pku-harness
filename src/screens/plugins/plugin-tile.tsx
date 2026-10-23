import { View } from 'react-native';

import type { ChipTone } from '@/components/chip';
import { Icon } from '@/components/icon';
import type { PluginDef } from '@/core/runtime/types';
import { useTheme, type ThemeColors } from '@/theme';
import { cx } from '@/utils/cx';

import { pluginIcon } from './effects';

const BG: Record<ChipTone, string> = {
  neutral: 'bg-surface-3',
  accent: 'bg-accent-muted',
  up: 'bg-up-muted',
  down: 'bg-down-muted',
  warn: 'bg-warn-muted',
  info: 'bg-info-muted',
};
const FG: Record<ChipTone, keyof ThemeColors> = { neutral: 'text', accent: 'accent', up: 'up', down: 'down', warn: 'warn', info: 'info' };

const SIZE = {
  sm: { box: 'h-7 w-7 rounded-sm', icon: 14 },
  md: { box: 'h-10 w-10 rounded-md', icon: 20 },
  lg: { box: 'h-14 w-14 rounded-lg', icon: 28 },
} as const;

/** A plugin's icon in a tinted, concentric tile. `muted` greys it out (plugin off or unavailable). */
export function PluginTile({ plugin, tone = 'accent', size = 'md', muted }: { plugin: PluginDef; tone?: ChipTone; size?: keyof typeof SIZE; muted?: boolean }) {
  const c = useTheme();
  const s = SIZE[size];
  return (
    <View className={cx('items-center justify-center', s.box, muted ? BG.neutral : BG[tone])} style={{ borderCurve: 'continuous' }}>
      <Icon name={pluginIcon(plugin)} size={s.icon} color={muted ? c.textFaint : c[FG[tone]]} />
    </View>
  );
}
