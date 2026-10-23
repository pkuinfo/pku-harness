import { router } from 'expo-router';
import { View } from 'react-native';

import { GlassEdges } from '@/components/glass';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme';
import { PluginTile } from '@/screens/plugins/plugin-tile';
import { GROUP_TONE, groupOf, isRunning, summarize } from '@/screens/plugins/status';
import { StatusDot } from '@/screens/plugins/status-dot';
import { usePluginEntries } from '@/screens/plugins/use-plugin-status';

/** Icons previewed on the card before "+N". */
const PREVIEW = 6;

/**
 * Settings' one way into plugins: a single card with the live summary ("18 on · 2 need
 * sign-in") and a strip of running plugins. Everything else (per-plugin settings, permissions)
 * lives on the plugins page.
 */
export function PluginsEntry() {
  const c = useTheme();
  const t = useT();
  const entries = usePluginEntries();
  const { on, signIn } = summarize(entries.map((e) => e.status));
  const running = entries.filter((e) => isRunning(e.status) && !e.plugin.core);
  const preview = (running.length ? running : entries).slice(0, PREVIEW);
  const more = (running.length ? running : entries).length - preview.length;
  const summary = [t('app.settings.pluginsOn', { count: on }), signIn ? t('app.settings.pluginsSignIn', { count: signIn }) : ''].filter(Boolean).join(t('app.ui.listSep'));

  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={`${t('app.settings.plugins')}, ${summary}`} scaleTo={0.985} onPress={() => router.push('/plugins')}>
      <View className="gap-3 rounded-lg bg-surface p-4" style={{ borderCurve: 'continuous' }}>
        <GlassEdges />
        <View className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            <Text variant="bodyStrong">{t('app.settings.plugins')}</Text>
            <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
              <View className="flex-row items-center gap-1.5">
                <StatusDot tone="up" />
                <Text variant="caption" tone="muted">
                  {t('app.settings.pluginsOn', { count: on })}
                </Text>
              </View>
              {signIn ? (
                <View className="flex-row items-center gap-1.5">
                  <StatusDot tone="warn" />
                  <Text variant="caption" tone="muted">
                    {t('app.settings.pluginsSignIn', { count: signIn })}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Icon name="chevronRight" size={16} color={c.textFaint} />
        </View>
        {preview.length ? (
          <View className="flex-row items-center gap-1.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {preview.map((e) => (
              <PluginTile key={e.plugin.id} plugin={e.plugin} tone={GROUP_TONE[groupOf(e.plugin)]} size="sm" />
            ))}
            {more > 0 ? (
              <View className="h-7 justify-center rounded-sm bg-surface-3 px-2" style={{ borderCurve: 'continuous' }}>
                <Text variant="micro" tone="muted">
                  +{more}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <Text variant="caption" tone="faint">
          {t('app.settings.pluginsHint')}
        </Text>
      </View>
    </PressableScale>
  );
}
