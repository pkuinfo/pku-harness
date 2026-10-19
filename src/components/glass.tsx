import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { glassMaterial, radius as radii, springs, useThemeName } from '@/theme';
import { haptics } from '@/utils/haptics';

/** iOS 26 system glass when the build and device support it (expo-glass-effect docs). */
const nativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

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

/**
 * The panel material (docs/DESIGN.md §1), kept restrained and nearly transparent:
 *
 * - iOS 26: the system liquid glass (`GlassView`).
 * - Elsewhere: a barely-there fill over the aurora, one hairline edge, and a thin light line
 *   along the top edge as the only highlight. No milky sheen, no outlines, no glare.
 *
 * Pressable glass lifts its fill a touch and settles back with the shared spring.
 */
export function Glass({ children, style, radius = radii.lg, tone = 'regular', onPress, onLongPress, accessibilityLabel, accessibilityRole, haptic = true }: GlassProps) {
  const m = glassMaterial[useThemeName()];
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const interactive = !!(onPress || onLongPress);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const liftStyle = useAnimatedStyle(() => ({ opacity: lift.get() }));

  const brand = tone === 'brand';
  const shape = { borderRadius: radius, borderCurve: 'continuous' } as const;
  const inset = Math.min(radius, 24);

  const surface =
    nativeGlass && !brand ? (
      <GlassView style={[StyleSheet.absoluteFill, shape]} glassEffectStyle="regular" isInteractive={interactive} />
    ) : (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          shape,
          {
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: brand ? m.brandEdge : m.edge,
            backgroundColor: brand ? m.brand : tone === 'strong' ? m.fillStrong : m.fill,
          },
        ]}>
        <View style={[styles.topLight, { left: inset, right: inset, backgroundImage: m.topLight }]} />
        {interactive ? <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: m.pressed }, liftStyle]} /> : null}
      </View>
    );

  const body = (
    <Animated.View style={[shape, { boxShadow: nativeGlass || brand ? undefined : m.shadow }, style, interactive && pressStyle]}>
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
        scale.set(withSpring(0.98, springs.snappy));
      }}
      onPressOut={() => {
        lift.set(withTiming(0, { duration: 260 }));
        scale.set(withSpring(1, springs.snappy));
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

const styles = StyleSheet.create({
  topLight: { position: 'absolute', top: 0, height: 1 },
});

/**
 * The glass details for a panel that paints its own fill (`theme.surface*`): one hairline edge
 * and the top-edge light. Place as the first child of a positioned, rounded container.
 */
export function GlassEdges({ radius = radii.lg }: { radius?: number }) {
  const m = glassMaterial[useThemeName()];
  const inset = Math.min(radius, 24);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: m.edge, overflow: 'hidden' }]}>
      <View style={[styles.topLight, { left: inset, right: inset, backgroundImage: m.topLight }]} />
    </View>
  );
}
