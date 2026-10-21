import { useEffect, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { FadeIn } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { MAX_CONTENT_WIDTH } from '@/hooks/use-layout';
import { curves, duration, spacing, useTheme } from '@/theme';

import { TASK_STEPS, stepPosition, type SetupStep } from '../flow';
import { StepArt } from '../intro/illustrations/step-art';

const EASE_OUT = Easing.bezier(...curves.out);

/** One segment per task step: done ones full, the current one fills as it arrives. */
function Progress({ step }: { step: SetupStep }) {
  const pos = stepPosition(step);
  if (!pos) return <View className="flex-1" />;
  return (
    <View className="flex-1 gap-1.5" accessible accessibilityRole="progressbar" accessibilityLabel={`第 ${pos.index} 步，共 ${pos.total} 步`}>
      <View className="flex-row gap-1.5">
        {TASK_STEPS.map((s, i) => (
          <Segment key={s} state={i + 1 < pos.index ? 'done' : i + 1 === pos.index ? 'current' : 'todo'} />
        ))}
      </View>
      <Text variant="micro" tone="faint">
        {pos.index} / {pos.total}
      </Text>
    </View>
  );
}

function Segment({ state }: { state: 'done' | 'current' | 'todo' }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(state === 'done' || (state === 'current' && reduced) ? 1 : 0);
  useEffect(() => {
    if (state === 'current' && !reduced) fill.set(withDelay(duration.base, withTiming(1, { duration: duration.slow + 180, easing: EASE_OUT })));
    else fill.set(state === 'done' ? 1 : 0);
  }, [state, reduced, fill]);
  // Absolute and childless: animating its width re-lays out nothing else.
  const style = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));
  return (
    <View className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
      <Animated.View className="absolute top-0 bottom-0 left-0 rounded-full bg-accent" style={style} />
    </View>
  );
}

/**
 * A full-screen setup step: progress, a big title with one line of why, native controls, and
 * the action pinned above the keyboard with 稍后设置 under it.
 */
export function StepShell({
  step,
  icon,
  title,
  why,
  children,
  primary,
  onPrimary,
  primaryLoading,
  primaryDisabled,
  onSkip,
  onBack,
  note,
  hero,
}: {
  step: SetupStep;
  icon?: IconName;
  /** Replaces the header illustration (the finish screen's 3D hero). */
  hero?: ReactNode;
  title: string;
  why: string;
  children?: ReactNode;
  primary: string;
  onPrimary: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  onSkip?: () => void;
  onBack?: () => void;
  note?: string;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView className="flex-1" behavior="padding">
      <View className="flex-row items-center gap-3 px-4 pb-2" style={{ paddingTop: insets.top + spacing.sm }}>
        {onBack ? <IconButton icon="back" label="上一步" variant="ghost" onPress={onBack} /> : <View className="h-10 w-10" />}
        <Progress step={step} />
        <View className="h-10 w-10" />
      </View>
      <ScrollView className="flex-1" contentContainerClassName="w-full self-center gap-6 px-6 pt-4 pb-8" contentContainerStyle={{ maxWidth: MAX_CONTENT_WIDTH }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="gap-3">
          {hero ??
            ((TASK_STEPS as readonly SetupStep[]).includes(step) ? (
              <FadeIn index={0}>
                <StepArt step={step} />
              </FadeIn>
            ) : (
              <FadeIn index={0}>
                <View className="h-12 w-12 items-center justify-center rounded-lg bg-accent-muted" style={{ borderCurve: 'continuous' }}>
                  <Icon name={icon ?? 'sparkles'} size={24} color={c.accent} />
                </View>
              </FadeIn>
            ))}
          <FadeIn index={1}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
          </FadeIn>
          <FadeIn index={2}>
            <Text variant="body" tone="muted">
              {why}
            </Text>
          </FadeIn>
        </View>
        {children}
      </ScrollView>
      <View className="w-full gap-1 self-center px-6 pt-3" style={{ maxWidth: MAX_CONTENT_WIDTH, paddingBottom: Math.max(insets.bottom, spacing.md) }}>
        {note ? (
          <Text variant="caption" tone="faint" align="center" className="mb-1">
            {note}
          </Text>
        ) : null}
        <Button title={primary} size="lg" onPress={onPrimary} loading={primaryLoading} disabled={primaryDisabled} />
        {onSkip ? <Button title="稍后设置" variant="ghost" size="md" onPress={onSkip} /> : null}
      </View>
    </KeyboardAvoidingView>
  );
}
