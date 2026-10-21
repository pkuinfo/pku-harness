import { View } from 'react-native';

import { Text } from '@/components/text';
import { AccountBalance } from '@/screens/settings/ai-balance';
import { registry } from '@/core/runtime/registry';
import type { Money, Spending } from '@/core/usage/aggregate';
import { formatCompact, formatMoney, formatMonies } from '@/core/usage/format';
import { useT } from '@/i18n';

import { RankedRow } from './ranked-row';
import { Section } from './section';

const modelName = (providerId: string, model: string) => registry.provider(providerId)?.def.models.find((x) => x.id === model)?.name ?? model;

/** A sum that may span currencies; "¥0" in the main currency when nothing was spent. */
function Amount({ label, list, fallback }: { label: string; list: Money[]; fallback: Money['currency'] }) {
  const text = list.length ? formatMonies(list) : formatMoney(0, fallback);
  return (
    <View className="flex-1 gap-0.5" accessible accessibilityLabel={`${label} ${text}`}>
      <Text variant="micro" tone="faint">
        {label}
      </Text>
      <Text variant="numberM" numberOfLines={1} adjustsFontSizeToFit>
        {text}
      </Text>
    </View>
  );
}

/**
 * Estimated spending from published prices (one sum per currency, never mixed), per model, and
 * the active provider's own balance when it can report one. The caller hides it when there is
 * neither.
 */
export function SpendSection({ spend, providerId, turns }: { spend: Spending; providerId: string; turns: number }) {
  const t = useT();
  const main = spend.month[0]?.currency ?? spend.models[0]?.currency ?? 'CNY';
  const provider = spend.models[0] ? registry.provider(spend.models[0].providerId)?.def.name : undefined;
  return (
    <Section title={t('app.usage.spendTitle')}>
      {spend.priced ? (
        <>
          <View className="flex-row gap-4">
            <Amount label={t('app.usage.spendToday')} list={spend.today} fallback={main} />
            {/* This month's total is already a KPI tile above; the average per turn is new information. */}
            <Amount label={t('app.usage.spendPerTurn')} list={turns > 0 ? spend.month.map((m) => ({ ...m, amount: m.amount / turns })) : []} fallback={main} />
          </View>
          {spend.models.length ? (
            <View className="gap-3">
              <Text variant="micro" tone="faint">
                {t('app.usage.spendModels')}
              </Text>
              {spend.models.map((m) => (
                <RankedRow
                  key={`${m.providerId}/${m.model}`}
                  title={modelName(m.providerId, m.model)}
                  subtitle={registry.provider(m.providerId)?.def.name ?? m.providerId}
                  value={formatMoney(m.amount, m.currency)}
                  detail={t('app.usage.modelTokens', { tokens: formatCompact(m.tokens) })}
                  share={m.share}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <Text variant="callout" tone="muted">
          {t('app.usage.spendNone')}
        </Text>
      )}
      {/* The same card as Settings → AI 服务, so both screens show one reading the same way. */}
      <AccountBalance providerId={providerId} />
      <View className="gap-1">
        {spend.unpricedTokens > 0 ? (
          <Text variant="caption" tone="faint">
            {t('app.usage.spendUnpriced', { tokens: formatCompact(spend.unpricedTokens) })}
          </Text>
        ) : null}
        <Text variant="caption" tone="faint">
          {provider ? t('app.usage.spendNote', { provider }) : t('app.usage.spendNoteGeneric')}
        </Text>
      </View>
    </Section>
  );
}

/** The active provider's balance (`useProviderBalance`); renders nothing when unsupported. */
