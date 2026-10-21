import type { ProviderBalance } from '@pku-harness/sdk';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedNumber } from '@/components/animated-number';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Skeleton } from '@/components/skeleton';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { useProviderBalance } from '@/core/agent/balance';
import { useT } from '@/i18n';
import { typography, useTheme } from '@/theme';
import { formatAgo, isJustNow } from '@/utils/date';
import { haptics } from '@/utils/haptics';

const SYMBOL: Record<string, string> = { CNY: '¥', USD: '$' };

/** ¥1,234.50 / $1.50 / EUR 3.00 (amounts as the provider reports them, two decimals). */
const money = (currency: string, n: number) => {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${SYMBOL[currency] ?? `${currency} `}${grouped}.${dec}`;
};

/** CNY first (DeepSeek's main account), then whatever else the provider reports. */
const ordered = (balances: ProviderBalance[]) => [...balances].sort((a, b) => Number(b.currency === 'CNY') - Number(a.currency === 'CNY'));

/** Refresh glyph that turns while a reading is on its way (still under reduced motion). */
function RefreshGlyph({ spinning }: { spinning: boolean }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (spinning && !reduced) {
      turn.value = 0;
      turn.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(turn);
      turn.value = withTiming(0, { duration: 160 });
    }
  }, [spinning, reduced, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon name="refresh" size={14} color={c.textFaint} />
    </Animated.View>
  );
}

/**
 * Settings → AI 服务: the provider account's balance (ProviderDef.balance, e.g. DeepSeek
 * GET /user/balance). Renders nothing for providers that can't report one or have no key.
 * Tap the card to refresh; readings are cached for a minute.
 */
export function AccountBalance({ providerId }: { providerId: string }) {
  const t = useT();
  const c = useTheme();
  const { state, refresh } = useProviderBalance(providerId);
  // Keep "Updated 3 min ago" honest while the sheet stays open.
  const [, tick] = useState(0);
  useEffect(() => {
    if (state.kind !== 'ready') return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [state.kind]);

  if (state.kind === 'unsupported') return null;

  const busy = state.kind === 'loading' || (state.kind === 'ready' && !!state.refreshing);
  const onPress = () => {
    haptics.select();
    refresh();
  };
  const balances = state.kind === 'ready' ? ordered(state.account.balances) : [];
  const [hero, ...rest] = balances;

  return (
    <Animated.View entering={FadeIn} layout={LinearTransition}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('app.ai.balance.refresh')}
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={onPress}
        scaleTo={0.98}>
        <Surface className="gap-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="micro" tone="faint">
              {t('app.ai.balance.title')}
            </Text>
            <View className="flex-row items-center gap-1">
              {state.kind === 'ready' ? (
                <Text variant="caption" tone="faint">
                  {state.refreshing ? t('app.ai.balance.updating') : isJustNow(state.at) ? t('app.ai.balance.updatedNow') : t('app.ai.balance.updated', { time: formatAgo(state.at) })}
                </Text>
              ) : null}
              <RefreshGlyph spinning={busy} />
            </View>
          </View>

          {state.kind === 'loading' ? (
            <View className="gap-2">
              <Skeleton width="45%" height={typography.numberL.lineHeight} />
              <Skeleton width="60%" height={typography.caption.lineHeight} />
            </View>
          ) : null}

          {state.kind === 'error' ? (
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <Icon name="warning" size={16} color={c.down} />
                <Text variant="callout" tone="down">
                  {t('app.ai.balance.error')}
                </Text>
              </View>
              <Text variant="caption" tone="muted" numberOfLines={3}>
                {state.message}
              </Text>
              <Button title={t('core.common.retry')} size="sm" variant="secondary" icon="refresh" onPress={onPress} className="self-start" />
            </View>
          ) : null}

          {state.kind === 'ready' ? (
            <View className="gap-1">
              {hero ? (
                <>
                  <AnimatedNumber value={hero.total} variant="numberL" format={(n) => money(hero.currency, n)} />
                  {hero.granted !== undefined && hero.toppedUp !== undefined ? (
                    <Text variant="caption" tone="muted">
                      {t('app.ai.balance.breakdown', { granted: money(hero.currency, hero.granted), toppedUp: money(hero.currency, hero.toppedUp) })}
                    </Text>
                  ) : null}
                  {rest.map((b) => (
                    <Text key={b.currency} variant="caption" tone="muted">
                      {money(b.currency, b.total)}
                    </Text>
                  ))}
                </>
              ) : (
                <Text variant="callout" tone="muted">
                  {t('app.ai.balance.empty')}
                </Text>
              )}
            </View>
          ) : null}

          {state.kind === 'ready' && !state.account.available ? (
            <Animated.View entering={FadeIn} className="flex-row items-start gap-2 rounded-md bg-warn-muted p-3" style={{ borderCurve: 'continuous' }}>
              <Icon name="warning" size={16} color={c.warn} />
              <Text variant="caption" tone="warn" className="flex-1">
                {t('app.ai.balance.unavailable')}
              </Text>
            </Animated.View>
          ) : null}
        </Surface>
      </PressableScale>
    </Animated.View>
  );
}
