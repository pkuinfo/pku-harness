import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FadeIn as Enter } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { phoneService } from '@/core/phone/service';
import { useT, type MessageKey } from '@/i18n';
import { useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { StepShell } from './step-shell';
import { useCopilotSetup } from './use-copilot-ready';

const POINTS: { icon: IconName; text: MessageKey }[] = [
  { icon: 'phone', text: 'welcome.copilot.pointSeparate' },
  { icon: 'shield', text: 'welcome.copilot.pointAllowed' },
  { icon: 'check', text: 'welcome.copilot.pointConfirm' },
];

/** What Copilot needs, in setup order; accessibility is named because Copilot reads and types through it. */
const NEEDS: { id: string; title: MessageKey; why: MessageKey }[] = [
  { id: 'helper', title: 'welcome.copilot.needHelper', why: 'welcome.copilot.needHelperWhy' },
  { id: 'accessibility', title: 'welcome.copilot.needAccessibility', why: 'welcome.copilot.needAccessibilityWhy' },
  { id: 'apps', title: 'welcome.copilot.needApps', why: 'welcome.copilot.needAppsWhy' },
];

/**
 * Step 6 · Copilot: lets the assistant operate other apps on the phone. Setup itself happens on
 * Copilot's own screen (pairing, permissions, allowed apps); this step explains it, opens that
 * screen, and shows it ready when the user comes back. Its checklist names what Copilot needs,
 * with the accessibility permission called out (it can be turned on right here). Android only;
 * skippable.
 */
export function CopilotStep({ onDone, onSkip, onBack }: { onDone: () => void; onSkip: () => void; onBack: () => void }) {
  const t = useT();
  const c = useTheme();
  const { ready, missing, refresh } = useCopilotSetup();
  const [busy, setBusy] = useState(false);
  // With the helper connected this turns accessibility on directly; otherwise it opens Android's
  // accessibility list at Copilot's row. The status is re-read when the screen comes back.
  const turnOnAccessibility = async () => {
    setBusy(true);
    try {
      await phoneService.setup('accessibility');
    } catch {}
    setBusy(false);
    refresh();
  };
  const was = useRef(ready);
  useEffect(() => {
    if (ready && was.current === false) haptics.success();
    was.current = ready;
  }, [ready]);

  // Copilot needs Android's phone control; elsewhere the step passes itself.
  useEffect(() => {
    if (Platform.OS !== 'android') onSkip();
  }, [onSkip]);

  return (
    <StepShell
      step="copilot"
      icon="phone"
      title={t('welcome.copilot.title')}
      why={t('welcome.copilot.why')}
      primary={ready ? t('welcome.step.continue') : t('welcome.copilot.setUp')}
      onPrimary={ready ? onDone : () => router.push('/p/copilot/home')}
      onSkip={ready ? undefined : onSkip}
      onBack={onBack}
      note={ready ? undefined : t('welcome.copilot.note')}>
      <Enter index={3}>
        <View className="gap-4">
          {POINTS.map((p) => (
            <View key={p.text} className="flex-row items-start gap-3">
              <Icon name={p.icon} size={18} color={c.textMuted} />
              <Text variant="callout" className="flex-1">
                {t(p.text)}
              </Text>
            </View>
          ))}
        </View>
      </Enter>
      {!missing ? null : (
        <Enter index={4}>
          <View className="gap-3 rounded-lg bg-surface-2 p-4" style={{ borderCurve: 'continuous' }}>
            {NEEDS.map((n) => {
              const done = !missing.includes(n.id);
              return (
                <View key={n.id} className="gap-2">
                  <View className="flex-row items-center gap-3">
                    <Icon name={done ? 'check' : 'lock'} size={16} color={done ? c.up : c.textMuted} />
                    <Text variant="callout" className="flex-1">
                      {t(n.title)}
                    </Text>
                    <Text variant="caption" tone={done ? 'muted' : 'faint'}>
                      {t(done ? 'welcome.copilot.needDone' : 'welcome.copilot.needTodo')}
                    </Text>
                  </View>
                  <Text variant="caption" tone="muted" className="pl-7">
                    {t(n.why)}
                  </Text>
                  {n.id === 'accessibility' && !done ? (
                    <View className="flex-row pl-7">
                      <Button title={t('welcome.copilot.turnOnAccessibility')} variant="secondary" size="sm" loading={busy} disabled={busy} onPress={() => void turnOnAccessibility()} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Enter>
      )}
      {ready ? (
        <Animated.View entering={FadeIn} className="flex-row">
          <Chip label={t('welcome.copilot.ready')} tone="up" icon="check" />
        </Animated.View>
      ) : null}
    </StepShell>
  );
}
