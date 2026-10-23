import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shadows, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

export type MenuOption<T extends string> = { value: T; label: string; description?: string; icon?: IconName; tint?: string };

const WIDTH = 264;
const GAP = 6;
const ROW = 60;

/** Grows out of the trigger's corner: small scale + fade, quick (a popover, not a sheet). */
const pop = (fromTop: boolean) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: fromTop ? -6 : 6 }, { scale: 0.94 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
  }).duration(160);

/**
 * A trigger that opens a small anchored menu of choices (each with an optional one-line
 * description and a check on the current one). Right-aligned under the trigger, flipped above
 * when there's no room below. Use for a compact "current value ▾" control in a list row.
 */
export function OptionMenu<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
  children,
}: {
  value: T;
  options: MenuOption<T>[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** The trigger's content (e.g. a pill showing the current value). */
  children: ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<{ top: number; right: number; fromTop: boolean } | null>(null);

  const open = () => {
    anchor.current?.measureInWindow((x, y, w, h) => {
      const menuH = options.length * ROW + 12;
      const below = y + h + GAP + menuH < height - insets.bottom - 8;
      setAt({ top: below ? y + h + GAP : Math.max(insets.top + 8, y - GAP - menuH), right: Math.max(8, width - (x + w)), fromTop: below });
    });
  };
  const pick = (v: T) => {
    setAt(null);
    if (v !== value) {
      haptics.select();
      onChange(v);
    }
  };

  const current = options.find((o) => o.value === value);
  return (
    <>
      <View ref={anchor} collapsable={false}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ text: current?.label }}
          accessibilityState={{ expanded: !!at }}
          scaleTo={0.95}
          onPress={open}
          hitSlop={8}>
          {children}
        </PressableScale>
      </View>
      {/* Mounted only while open: toggling `visible` on a kept Modal left it unable to reopen on Android. */}
      {at ? (
        <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setAt(null)}>
          <Pressable className="flex-1" accessibilityLabel={accessibilityLabel} accessibilityHint="Close" onPress={() => setAt(null)}>
            <Animated.View
              entering={pop(at.fromTop)}
              accessibilityViewIsModal
              accessibilityRole="menu"
              className="absolute overflow-hidden rounded-lg border-[0.5px] border-edge bg-elevated py-1.5"
              style={{ top: at.top, right: at.right, width: WIDTH, borderCurve: 'continuous', boxShadow: shadows.overlay, transformOrigin: at.fromTop ? 'top right' : 'bottom right' }}>
              {options.map((o) => {
                const selected = o.value === value;
                return (
                  <PressableScale
                    key={o.value}
                    accessibilityRole="menuitem"
                    accessibilityLabel={o.label}
                    accessibilityHint={o.description}
                    accessibilityState={{ selected }}
                    haptic={false}
                    scaleTo={0.98}
                    onPress={() => pick(o.value)}>
                    <View className="flex-row items-center gap-3 px-3.5" style={{ minHeight: ROW }}>
                      {o.icon ? <Icon name={o.icon} size={18} color={o.tint ?? c.textMuted} /> : null}
                      <View className="flex-1 gap-0.5">
                        <Text variant="bodyStrong">{o.label}</Text>
                        {o.description ? (
                          <Text variant="caption" tone="muted" numberOfLines={2}>
                            {o.description}
                          </Text>
                        ) : null}
                      </View>
                      <View className="w-5 items-end">{selected ? <Icon name="check" size={18} color={c.accent} /> : null}</View>
                    </View>
                  </PressableScale>
                );
              })}
            </Animated.View>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
