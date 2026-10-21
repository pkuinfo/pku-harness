import { router } from 'expo-router';
import { useEffect } from 'react';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useContextBreakdown } from '@/core/usage/hooks';
import { formatCompact, formatPercent } from '@/core/usage/format';
import { useT } from '@/i18n';
import { springs, useTheme } from '@/theme';

import { PressableScale } from './pressable-scale';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 18;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const LEN = 2 * Math.PI * R;

/**
 * The composer's context meter (docs/AGENT-HARNESS.md §6.2): fill = session tokens / budget;
 * muted under 60 %, warn to 85 %, down above. Hidden while the session is empty. The sweep
 * springs on the UI thread when the size changes (per turn, never per token).
 */
export function ContextRing({ sessionId, onPress }: { sessionId?: string; onPress?: () => void }) {
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const b = useContextBreakdown(sessionId);
  const ratio = b.budget > 0 ? b.total / b.budget : 0;
  const fill = Math.min(1, Math.max(0, ratio));
  const color = ratio >= 0.85 ? c.down : ratio >= 0.6 ? c.warn : c.textMuted;

  const p = useSharedValue(fill);
  useEffect(() => {
    p.set(reduced ? fill : withSpring(fill, springs.smooth));
  }, [fill, reduced, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - p.get()) }));

  if (b.empty) return null;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('chat.context.ringA11y', { pct: formatPercent(ratio), used: formatCompact(b.total), budget: formatCompact(b.budget) })}
      accessibilityHint={t('chat.context.ringHint')}
      hitSlop={10}
      scaleTo={0.9}
      onPress={onPress ?? (() => router.push('/context'))}
      className="items-center justify-center"
      style={{ width: SIZE + 8, height: SIZE + 8 }}>
      <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* A visible full track and square ends: a gauge, never mistaken for a loading spinner. */}
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={c.textFaint} strokeOpacity={0.35} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={color}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="butt"
          strokeDasharray={`${LEN} ${LEN}`}
          animatedProps={props}
        />
      </Svg>
    </PressableScale>
  );
}
