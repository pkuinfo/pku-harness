import { View } from 'react-native';

import type { ChipTone } from '@/components/chip';
import { cx } from '@/utils/cx';

const BG: Record<ChipTone, string> = {
  neutral: 'bg-fg-faint',
  accent: 'bg-accent',
  up: 'bg-up',
  down: 'bg-down',
  warn: 'bg-warn',
  info: 'bg-info',
};

/** Small state dot. Always paired with a text label next to it, never colour alone. */
export function StatusDot({ tone }: { tone: ChipTone }) {
  return <View className={cx('h-1.5 w-1.5 rounded-full', BG[tone])} />;
}
