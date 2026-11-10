import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Chip } from '@/components/chip';
import { FadeIn as Enter } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { invokeTool } from '@/core/runtime/invoke';
import { useT, type MessageKey } from '@/i18n';
import { useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { StepShell } from './step-shell';

type CopilotStatus = { enabled?: boolean; setupMissing?: string[] };

const POINTS: { icon: IconName; text: MessageKey }[] = [
  { icon: 'phone', text: 'welcome.copilot.pointSeparate' },
  { icon: 'shield', text: 'welcome.copilot.pointAllowed' },
  { icon: 'check', text: 'welcome.copilot.pointConfirm' },
];

/**
 * Step 6 · Copilot: lets the assistant operate other apps on the phone. Setup itself happens on
 * Copilot's own screen (pairing, permissions, allowed apps); this step explains it, opens that
 * screen, and shows it ready when the user comes back. Android only; skippable.
 */
export function CopilotStep({ onDone, onSkip, onBack }: { onDone: () => void; onSkip: () => void; onBack: () => void }) {
  const t = useT();
  const c = useTheme();
  const [ready, setReady] = useState<boolean | null>(null);

  // Copilot needs Android's phone control; elsewhere the step passes itself.
  useEffect(() => {
    if (Platform.OS !== 'android') onSkip();
  }, [onSkip]);

  // Re-read whenever the step is shown again (back from Copilot's setup screen).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      invokeTool('copilot.status', {}, { actor: 'user' })
        .then((s) => {
          const status = s as CopilotStatus;
          const now = !!status.enabled && !status.setupMissing?.length;
          if (alive) {
            setReady((was) => {
              if (now && was === false) haptics.success();
              return now;
            });
          }
        })
        .catch(() => alive && setReady(false));
      return () => {
        alive = false;
      };
    }, []),
  );

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
      {ready ? (
        <Animated.View entering={FadeIn} className="flex-row">
          <Chip label={t('welcome.copilot.ready')} tone="up" icon="check" />
        </Animated.View>
      ) : null}
    </StepShell>
  );
}
