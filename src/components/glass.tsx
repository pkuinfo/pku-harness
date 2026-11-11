import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { glassMaterial, radius as radii, useThemeName } from '@/theme';
import { haptics } from '@/utils/haptics';
import { timings } from '@/theme/transitions';

export type GlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** 'regular' panels, 'strong' for dense content (lists, forms), 'brand' solid 北大红. */
  tone?: 'regular' | 'strong' | 'brand';
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'summary' | 'none';
  haptic?: boolean;
};

/** Opaque neutral panels. The legacy component name remains stable for plugin compatibility. */
export function Glass({ children, style, radius = radii.lg, tone = 'regular', onPress, onLongPress, accessibilityLabel, accessibilityRole, haptic = true }: GlassProps) {
  const m = glassMaterial[useThemeName()];
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const interactive = !!(onPress || onLongPress);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const liftStyle = useAnimatedStyle(() => ({ opacity: lift.get() }));

  const brand = tone === 'brand';
  const shape = { borderRadius: radius, borderCurve: 'continuous' } as const;

  const surface = (
      <View
        pointerEvents="none"
        className="absolute inset-0 overflow-hidden border-[0.5px]"
        style={[
          shape,
          {
            borderColor: brand ? m.brandEdge : m.edge,
            backgroundColor: brand ? m.brand : tone === 'strong' ? m.fillStrong : m.fill,
          },
        ]}>
        {interactive ? <Animated.View className="absolute inset-0" style={[{ backgroundColor: m.pressed }, liftStyle]} /> : null}
      </View>
    );

  const body = (
    <Animated.View style={[shape, { boxShadow: brand ? undefined : m.shadow }, style, interactive && pressStyle]}>
      {surface}
      {children}
    </Animated.View>
  );

  if (!interactive) return body;

  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        lift.set(withTiming(1, { duration: 90 }));
        scale.set(withTiming(0.98, timings.fast));
      }}
      onPressOut={() => {
        lift.set(withTiming(0, { duration: 260 }));
        scale.set(withTiming(1, timings.fast));
      }}
      onPress={() => {
        if (haptic) haptics.tap();
        onPress?.();
      }}
      onLongPress={onLongPress}>
      {body}
    </Pressable>
  );
}

/** A subtle hairline for containers that paint their own surface fill. */
export function GlassEdges({ radius = radii.lg }: { radius?: number }) {
  const m = glassMaterial[useThemeName()];
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 overflow-hidden border-[0.5px]"
      style={{ borderRadius: radius, borderCurve: 'continuous', borderColor: m.edge }}>
    </View>
  );
}
