import { Platform, View, useWindowDimensions } from 'react-native';

import { FadeIn } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { modelInfo } from '@/core/agent/attachments/attachments';
import { useAIConfig } from '@/core/agent/provider';
import { useCampusAccount } from '@/core/campus/account';
import { useDeliveryReadiness } from '@/hooks/use-delivery-readiness';
import { useT } from '@/i18n';
import { spacing, useTheme } from '@/theme';

import { remindersSummary } from '../flow';
import { useCopilotReady } from './use-copilot-ready';
import { BrandHero } from '../scene/brand-hero';
import { StepShell } from './step-shell';

function SummaryRow({ icon, label, value, ok, index }: { icon: IconName; label: string; value: string; ok: boolean; index: number }) {
  const c = useTheme();
  return (
    <FadeIn index={index}>
      <View className="flex-row items-center gap-3 py-2">
        <Icon name={icon} size={18} color={ok ? c.up : c.textFaint} />
        <Text variant="callout" tone="muted" className="w-20">
          {label}
        </Text>
        <Text variant="callout" tone={ok ? 'default' : 'faint'} className="flex-1" numberOfLines={1}>
          {value}
        </Text>
      </View>
    </FadeIn>
  );
}

/** The finish screen (完成): what was set up. No feature tour: the user just asks. */
export function DoneStep({ onFinish, onBack, live, forceFallback }: { onFinish: (question?: string) => void; onBack: () => void; live: boolean; forceFallback: boolean }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const { config, hasKey } = useAIConfig();
  const account = useCampusAccount();
  // Live, not the step's outcome: the user may have fixed a permission since (or saved progress predates the step).
  const { readiness } = useDeliveryReadiness();
  const reminders = readiness ? remindersSummary(readiness) : null;
  const copilot = useCopilotReady();

  return (
    <StepShell
      step="done"
      title={t('welcome.done.title')}
      why={hasKey ? t('welcome.done.why') : t('welcome.done.whyNoAI')}
      hero={
        <View className="items-center">
          <BrandHero size={Math.round(Math.min(width - spacing.xxxl * 2, 200))} active={live} mode="celebrate" forceFallback={forceFallback} />
        </View>
      }
      primary={t('welcome.done.start')}
      onPrimary={() => onFinish()}
      onBack={onBack}>
      <View>
        <SummaryRow index={3} icon="sparkles" label={t('welcome.done.ai')} ok={hasKey} value={hasKey ? `${config.name} · ${modelInfo(config.providerId, config.model)?.name ?? config.model}` : t('welcome.done.notConnected')} />
        <SummaryRow index={4} icon="person" label={t('welcome.done.account')} ok={account.signedIn} value={account.signedIn ? (account.name ?? account.username ?? t('welcome.done.signedIn')) : t('welcome.done.notSignedIn')} />
        <SummaryRow
          index={6}
          icon="alarm"
          label={t('welcome.done.reminders')}
          ok={reminders === 'onTime'}
          value={reminders === 'onTime' ? t('welcome.done.remindersOnTime') : reminders === 'mayBeLate' ? t('welcome.done.remindersMayBeLate') : reminders === 'off' ? t('welcome.done.remindersOff') : '—'}
        />
        {Platform.OS === 'android' ? (
          <SummaryRow index={7} icon="phone" label={t('welcome.done.copilot')} ok={!!copilot} value={copilot == null ? '—' : copilot ? t('welcome.done.copilotReady') : t('welcome.done.copilotLater')} />
        ) : null}
      </View>
    </StepShell>
  );
}
