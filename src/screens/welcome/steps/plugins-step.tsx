import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { FadeIn } from '@/components/fade-in';
import { GlassEdges } from '@/components/glass';
import { Icon, type IconName } from '@/components/icon';
import { NativeSwitch } from '@/components/native-switch';
import { Text } from '@/components/text';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import type { PluginDef } from '@/core/runtime/types';
import { radius, useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { groupPlugins, requirementBadges } from '../plugin-groups';
import { StepShell } from './step-shell';

function PluginRow({ plugin }: { plugin: PluginDef }) {
  const c = useTheme();
  const settings = usePluginSettings(plugin.id);
  const why = registry.unavailable(plugin.id);
  const badges = requirementBadges(plugin);
  const on = !why && settings.enabled;
  return (
    <View className="min-h-16 flex-row items-center gap-3 px-4 py-3">
      <View className={cx('h-9 w-9 items-center justify-center rounded-md', on ? 'bg-accent-muted' : 'bg-surface-3')} style={{ borderCurve: 'continuous' }}>
        <Icon name={(plugin.icon as IconName | undefined) ?? 'puzzle'} size={18} color={on ? c.accent : c.textMuted} />
      </View>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text variant="bodyStrong">{plugin.name}</Text>
          {badges.map((b) => (
            <Chip key={b} label={b} />
          ))}
        </View>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {why ?? plugin.description}
        </Text>
      </View>
      {plugin.core ? (
        <View accessible accessibilityLabel={`${plugin.name} 始终开启`} className="h-10 w-10 items-center justify-center">
          <Icon name="lock" size={16} color={c.textFaint} />
        </View>
      ) : (
        <NativeSwitch
          label={`启用 ${plugin.name}`}
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

/** Step 3 · 选择插件: what the assistant may use. Toggles write plugin settings directly. */
export function PluginsStep({ onDone, onSkip, onBack }: { onDone: () => void; onSkip: () => void; onBack: () => void }) {
  const groups = groupPlugins(usePlugins());
  return (
    <StepShell
      step="plugins"
      icon="puzzle"
      title="选择插件"
      why="每个校园服务都是一个插件。开启的插件，你和 AI 都能使用。"
      primary="继续"
      onPrimary={onDone}
      onSkip={onSkip}
      onBack={onBack}
      note="可以随时在 设置 → 插件 中更改">
      {groups.map((g, gi) => (
        <FadeIn key={g.id} index={gi + 3}>
          <View className="gap-2">
            <Text variant="micro" tone="faint" className="px-4">
              {g.title}
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
                {g.footer}
              </Text>
            ) : null}
          </View>
        </FadeIn>
      ))}
    </StepShell>
  );
}
