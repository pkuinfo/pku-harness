import { useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { shadows, springs, useTheme, type ThemeColors } from '@/theme';

type Tone = 'info' | 'warn';
type Toast = { id: number; text: string; tone: Tone };

const SHOW_MS = 2600;
let current: Toast | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Short composer feedback ("暂不支持这种文件", attachment limits). One at a time, newest wins. */
export const composerToast = {
  show(text: string, tone: Tone = 'info') {
    current = { id: ++seq, text, tone };
    emit();
  },
  hide(id?: number) {
    if (id !== undefined && current?.id !== id) return;
    current = null;
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => current,
};

const ICON: Record<Tone, { name: IconName; color: keyof ThemeColors }> = {
  info: { name: 'help', color: 'textMuted' },
  warn: { name: 'warning', color: 'warn' },
};

/** Renders above the composer box, in flow (Android only hit-tests inside a parent's bounds). */
export function ComposerToast() {
  const c = useTheme();
  const reduced = useReducedMotion();
  const toast = useSyncExternalStore(composerToast.subscribe, composerToast.get);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => composerToast.hide(toast.id), SHOW_MS);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  const icon = ICON[toast.tone];
  return (
    <Animated.View
      key={toast.id}
      entering={reduced ? FadeIn : FadeInDown.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness)}
      exiting={FadeOut}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      className="items-center">
      <View
        className="flex-row items-center gap-2 rounded-md border-[0.5px] border-edge bg-elevated px-3 py-2"
        style={{ borderCurve: 'continuous', boxShadow: shadows.float }}>
        <Icon name={icon.name} size={14} color={c[icon.color]} />
        <Text variant="callout">{toast.text}</Text>
      </View>
    </Animated.View>
  );
}
