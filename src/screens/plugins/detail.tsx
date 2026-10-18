import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/fade-in';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeSwitch } from '@/components/native-switch';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { usePlugin } from '@/core/runtime/hooks';
import { pluginSettings, usePluginSettings } from '@/core/runtime/plugin-settings';
import { radius, spacing, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { EFFECTS, effectsOf, MODE_OPTIONS, pluginIcon } from './effects';

/** Settings → 插件 → one plugin: on/off, per-effect modes, scopes, and its tools. */
export function PluginDetail({ id }: { id: string }) {
  const c = useTheme();
  const plugin = usePlugin(id);
  const settings = usePluginSettings(id);
  if (!plugin) {
    return (
      <Screen title="插件" back>
        <EmptyState icon="puzzle" title="找不到这个插件" message={`没有已安装的插件 ${id}`} />
      </Screen>
    );
  }
  const effects = effectsOf(plugin);
  const tools = Object.entries(plugin.tools);

  return (
    <Screen title={plugin.name} subtitle={`${plugin.id} · v${plugin.version}`} back>
      <FadeIn index={0}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: c.accentMuted }]}>
            <Icon name={pluginIcon(plugin)} size={26} color={c.accent} />
          </View>
          <Text variant="callout" tone="muted" style={{ flex: 1 }}>
            {plugin.description}
          </Text>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <ListGroup footer={plugin.core ? undefined : '关闭后，AI 和看板都无法调用这个插件。'}>
          <ListRow
            icon="bolt"
            title={plugin.core ? '系统能力' : '启用插件'}
            subtitle={plugin.core ? '应用本身的一部分，始终开启' : undefined}
            accessory={
              plugin.core ? (
                <Chip label="已开启" tone="up" icon="check" />
              ) : (
                <NativeSwitch
                  label="启用插件"
                  value={settings.enabled}
                  onValueChange={(v) => {
                    haptics.tap();
                    pluginSettings.update(id, { enabled: v });
                  }}
                />
              )
            }
          />
        </ListGroup>
      </FadeIn>

      {effects.length && settings.enabled ? (
        <FadeIn index={2}>
          <View style={{ gap: spacing.sm }}>
            <Text variant="micro" tone="faint" style={styles.label}>
              AI 代你操作时
            </Text>
            <View style={[styles.group, { backgroundColor: c.surface }]}>
              {effects.map((e, i) => (
                <View key={e} style={[styles.effect, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={styles.effectHead}>
                    <Chip label={EFFECTS[e].label} tone={EFFECTS[e].tone} />
                    <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                      {EFFECTS[e].hint}
                    </Text>
                  </View>
                  <Segmented
                    options={MODE_OPTIONS}
                    value={settings.modes[e]}
                    onChange={(m) => pluginSettings.update(id, { modes: { ...settings.modes, [e]: m } })}
                  />
                </View>
              ))}
            </View>
            <Text variant="caption" tone="faint" style={styles.label}>
              你在界面上亲手点击的操作不受这里限制。
            </Text>
          </View>
        </FadeIn>
      ) : null}

      {plugin.scopes.length ? (
        <FadeIn index={3}>
          <ListGroup title="访问范围">
            {plugin.scopes.map((s) => (
              <ListRow key={s} icon="globe" title={s} />
            ))}
          </ListGroup>
        </FadeIn>
      ) : null}

      <FadeIn index={4}>
        <ListGroup title={`能力 · ${tools.length}`}>
          {tools.map(([name, t]) => (
            <ListRow
              key={name}
              title={t.title}
              subtitle={`${plugin.id}.${name}`}
              accessory={<Chip label={EFFECTS[t.effect].label} tone={EFFECTS[t.effect].tone} />}
            />
          ))}
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { paddingHorizontal: spacing.lg },
  group: { borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  effect: { padding: spacing.lg, gap: spacing.md },
  effectHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
