import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { IconButton } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FadeIn as Enter } from '@/components/fade-in';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Skeleton } from '@/components/skeleton';
import { Text } from '@/components/text';
import { pluginDescription, pluginName } from '@/core/runtime/localize';
import { MAX_CONTENT_WIDTH, useLayout } from '@/hooks/use-layout';
import { useLocale, useT } from '@/i18n';
import { duration, fonts, radius, spacing, typography, useTheme } from '@/theme';

import { ActionCard } from './action-card';
import { PluginCard } from './plugin-card';
import { GROUP_TONE, groupPlugins, matches, summarize } from './status';
import { usePluginEntries } from './use-plugin-status';
import { transitions } from '@/theme/transitions';

const GAP = 0;

/**
 * Settings → Plugins: every plugin as a compact row, grouped (campus services, system, AI
 * providers, remote), each with its live status and switch. Tapping a row opens the plugin's
 * page (settings, permissions, tools). Groups come from manifest fields, never plugin ids.
 */
export function PluginsScreen() {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const reduced = useReducedMotion();
  const entries = usePluginEntries();
  const [query, setQuery] = useState('');

  // Screen content is centred at MAX_CONTENT_WIDTH with the standard side padding.
  const { contentWidth } = useLayout();
  const inner = Math.min(contentWidth, MAX_CONTENT_WIDTH) - spacing.lg * 2;
  const columns = 1;
  const cardWidth = Math.floor((inner - GAP * (columns - 1)) / columns);

  const searching = query.trim().length > 0;
  const shown = entries.filter(({ plugin }) => matches(query, [pluginName(plugin, locale), plugin.name, pluginDescription(plugin, locale), plugin.id]));
  // Keep the remote section available for its add / marketplace actions.
  const groups = groupPlugins(
    shown.map((e) => ({ id: e.plugin.id, core: e.plugin.core, requires: e.plugin.requires, remote: e.plugin.remote, providers: e.plugin.providers, entry: e })),
    searching ? [] : ['remote'],
  );
  const { on, total } = summarize(entries.map((e) => e.status));
  // Keep stable ordering across groups.
  const order = new Map(groups.flatMap((g) => g.plugins).map((p, i) => [p.id, i]));
  const layout = reduced ? undefined : transitions.layout;

  return (
    <Screen title={t('app.plugins.title')} subtitle={total ? t('app.plugins.countLine', { on, total }) : undefined} back keyboardShouldPersistTaps="handled">
      <Enter index={0}>
        <View className="h-11 flex-row items-center gap-2 rounded-md border-[0.5px] border-edge bg-surface-2 pl-3 pr-1" style={{ borderCurve: 'continuous' }}>
          <Icon name="search" size={16} color={c.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('app.plugins.search')}
            placeholderTextColor={c.textFaint}
            selectionColor={c.accent}
            accessibilityLabel={t('app.plugins.search')}
            returnKeyType="search"
            autoCorrect={false}
            className="flex-1 py-2 text-fg"
            style={{ fontFamily: fonts.regular, fontSize: typography.body.fontSize }}
          />
          {searching ? <IconButton icon="close" label={t('app.plugins.clearSearch')} variant="ghost" size={36} onPress={() => setQuery('')} /> : null}
        </View>
      </Enter>

      {entries.length === 0 ? (
        // Plugins register at startup; this only shows for a moment on a cold start.
        <View className="flex-row flex-wrap" style={{ gap: GAP }} accessibilityLabel={t('app.plugins.loading')}>
          {Array.from({ length: columns * 2 }, (_, i) => (
            <Skeleton key={i} width={cardWidth} height={spacing.xxxl + spacing.lg} rounded={radius.lg} />
          ))}
        </View>
      ) : groups.length === 0 ? (
        <Animated.View entering={FadeIn.duration(duration.base)}>
          <EmptyState icon="search" title={t('app.plugins.noMatch')} message={t('app.plugins.noMatchMessage', { query: query.trim() })} />
        </Animated.View>
      ) : (
        groups.map((g) => (
          <Animated.View key={g.id} layout={layout} entering={FadeIn.duration(duration.base)} exiting={FadeOut.duration(duration.fast)} className="gap-2">
            <View className="flex-row items-baseline justify-between px-1" accessibilityRole="header">
              <Text variant="caption" tone="muted">
                {t(g.title)}
              </Text>
              {g.plugins.length ? (
                <Text variant="caption" tone="muted">
                  {g.plugins.length}
                </Text>
              ) : null}
            </View>
            <View className="flex-row flex-wrap" style={{ gap: GAP }}>
              {g.plugins.map((p) => (
                <PluginCard key={p.id} entry={p.entry} tone={GROUP_TONE[g.id]} width={cardWidth} index={order.get(p.id) ?? 0} />
              ))}
              {g.id === 'remote' && !searching ? (
                <>
                  <ActionCard icon="plus" title={t('app.plugins.add')} subtitle={t('app.plugins.addSubtitle')} width={cardWidth} onPress={() => router.push('/plugins/add')} />
                  <ActionCard icon="store" title={t('app.plugins.market')} subtitle={t('app.plugins.marketSubtitle')} width={cardWidth} onPress={() => router.push('/plugins/market')} />
                </>
              ) : null}
            </View>
            {g.footer && !searching ? (
              <Text variant="caption" tone="faint" className="px-1">
                {t(g.footer)}
              </Text>
            ) : null}
          </Animated.View>
        ))
      )}
    </Screen>
  );
}
