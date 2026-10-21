import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { useCampusAccount } from '@/core/campus/account';
import { FadeIn } from '@/components/fade-in';
import { GlassEdges } from '@/components/glass';
import { Icon, type IconName } from '@/components/icon';
import { NativeSwitch } from '@/components/native-switch';
import { Text } from '@/components/text';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginDescription, pluginName } from '@/core/runtime/localize';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import type { PluginDef } from '@/core/runtime/types';
import { useLocale, useT } from '@/i18n';
import { radius, useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { groupPlugins, requirementBadges } from '../plugin-groups';
import { StepShell } from './step-shell';

function PluginRow({ plugin }: { plugin: PluginDef }) {
  const t = useT();
  const locale = useLocale();
  const name = pluginName(plugin, locale);
  const c = useTheme();
  const settings = usePluginSettings(plugin.id);
  const why = registry.unavailable(plugin.id);
  const { signedIn } = useCampusAccount();
  const badges = requirementBadges(plugin, { signedIn });
  const on = !why && settings.enabled;
  return (
    <View className="min-h-16 flex-row items-center gap-3 px-4 py-3">
      <View className={cx('h-9 w-9 items-center justify-center rounded-md', on ? 'bg-accent-muted' : 'bg-surface-3')} style={{ borderCurve: 'continuous' }}>
        <Icon name={(plugin.icon as IconName | undefined) ?? 'puzzle'} size={18} color={on ? c.accent : c.textMuted} />
      </View>
      <View className="flex-1 gap-1">
        <Text variant="bodyStrong">{name}</Text>
        {/* Own row under the title: the same shape whether the name is short or wraps. */}
        {badges.length ? (
          <View className="flex-row flex-wrap gap-1.5">
            {badges.map((b) => (
              <Chip key={b} label={t(b)} />
            ))}
          </View>
        ) : null}
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {why ?? pluginDescription(plugin, locale)}
        </Text>
      </View>
      {plugin.core ? (
        <View accessible accessibilityLabel={t('welcome.plugins.alwaysOnA11y', { name })} className="h-10 w-10 items-center justify-center">
          <Icon name="lock" size={16} color={c.textFaint} />
        </View>
      ) : (
        <NativeSwitch
          label={t('welcome.plugins.toggleA11y', { name })}
          value={on}
          disabled={!!why}
          onValueChange={(v) => {
            haptics.tap();
            void pluginSettings.update(plugin.id, { enabled: v });
          }}
        />
      )}
    </View>
  );
}

/** Step 3 · Choose plugins (选择插件): what the assistant may use. Toggles write plugin settings directly. */
export function PluginsStep({ onDone, onSkip, onBack }: { onDone: () => void; onSkip: () => void; onBack: () => void }) {
  const t = useT();
  const groups = groupPlugins(usePlugins());
  return (
    <StepShell
      step="plugins"
      icon="puzzle"
      title={t('welcome.plugins.title')}
      why={t('welcome.plugins.why')}
      primary={t('welcome.step.continue')}
      onPrimary={onDone}
      onSkip={onSkip}
      onBack={onBack}
      note={t('welcome.plugins.note')}>
      {groups.map((g, gi) => (
        <FadeIn key={g.id} index={gi + 3}>
          <View className="gap-2">
            <Text variant="micro" tone="faint" className="px-4">
              {t(g.title)}
            </Text>
            <View className="overflow-hidden rounded-lg bg-surface" style={{ borderCurve: 'continuous' }}>
              <GlassEdges radius={radius.lg} />
              {g.plugins.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <View className="ml-16 bg-edge" style={{ height: StyleSheet.hairlineWidth }} /> : null}
                  <PluginRow plugin={p} />
                </View>
              ))}
            </View>
            {g.footer ? (
              <Text variant="caption" tone="faint" className="px-4">
                {t(g.footer)}
              </Text>
            ) : null}
          </View>
        </FadeIn>
      ))}
    </StepShell>
  );
}
