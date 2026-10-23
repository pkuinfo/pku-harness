import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Skeleton } from '@/components/skeleton';
import { Text } from '@/components/text';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginDescription, pluginName } from '@/core/runtime/localize';
import { loadMarketplace, type MarketState, type RegistryEntry } from '@/core/runtime/marketplace';
import { hostHas, registry } from '@/core/runtime/registry';
import type { Capability } from '@/core/runtime/types';
import { useLocale, useT, type Locale } from '@/i18n';
import { fonts, radius, typography, useTheme } from '@/theme';

type Filter = 'all' | 'builtin' | 'remote';

/**
 * Registry entries are written in Chinese. A built-in entry is the same plugin the app ships,
 * so its name and description come from the plugin's own English overlay when there is one.
 */
function entryText(entry: RegistryEntry, locale: Locale) {
  const plugin = entry.kind === 'builtin' ? registry.get(entry.id) : undefined;
  return plugin ? { name: pluginName(plugin, locale), description: pluginDescription(plugin, locale) } : { name: entry.name, description: entry.description };
}

function EntryCard({ entry, installed }: { entry: RegistryEntry; installed: boolean }) {
  const c = useTheme();
  const t = useT();
  const text = entryText(entry, useLocale());
  const missing = entry.requires.filter((r) => !hostHas(r as Capability));
  const action = () => {
    if (installed) {
      const id = entry.kind === 'builtin' ? entry.id : `mcp-${entry.id}`;
      router.push({ pathname: '/plugins/[id]', params: { id } });
    } else if (entry.endpoint) {
      router.push({ pathname: '/plugins/add', params: { url: entry.endpoint, name: entry.name } });
    } else {
      router.push({ pathname: '/plugins/add', params: { name: entry.name } });
    }
  };
  return (
    <View className="gap-3 rounded-lg bg-surface p-4" style={{ borderCurve: 'continuous' }}>
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-md bg-accent-muted" style={{ borderCurve: 'continuous' }}>
          <Icon name={(entry.icon as IconName) ?? 'puzzle'} size={20} color={c.accent} />
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1">
            <Text variant="bodyStrong" numberOfLines={1} className="shrink">
              {text.name}
            </Text>
            {entry.verified ? <Icon name="shield" size={14} color={c.up} /> : null}
          </View>
          <Text variant="caption" tone="faint">
            {entry.author} · {entry.kind === 'builtin' ? t('app.plugins.marketplace.builtin') : t('app.plugins.marketplace.remoteMcp')}
          </Text>
        </View>
      </View>
      <Text variant="callout" tone="muted">
        {text.description}
      </Text>
      <View className="flex-row flex-wrap gap-1">
        {entry.tags.map((tag) => (
          <Chip key={tag} label={tag} />
        ))}
        {missing.length ? <Chip label={t('app.plugins.marketplace.unsupported')} tone="warn" icon="warning" /> : null}
      </View>
      <View className="flex-row gap-2">
        <Button
          title={
            installed
              ? entry.kind === 'builtin'
                ? t('app.plugins.marketplace.included')
                : t('app.plugins.marketplace.installed')
              : entry.endpoint
                ? t('app.plugins.marketplace.install')
                : t('app.plugins.marketplace.enterUrl')
          }
          size="sm"
          variant={installed ? 'secondary' : 'primary'}
          onPress={action}
          disabled={!installed && missing.length > 0}
        />
        <Button title={t('app.plugins.marketplace.source')} size="sm" variant="ghost" icon="globe" onPress={() => WebBrowser.openBrowserAsync(entry.source)} />
      </View>
    </View>
  );
}

/** 插件市场: every plugin in the community registry, built-in and remote side by side. */
export function Marketplace() {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const filters: { label: string; value: Filter }[] = [
    { label: t('app.plugins.marketplace.all'), value: 'all' },
    { label: t('app.plugins.marketplace.builtin'), value: 'builtin' },
    { label: t('app.plugins.marketplace.remote'), value: 'remote' },
  ];
  const plugins = usePlugins();
  const [state, setState] = useState<MarketState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback((force = false) => {
    setRefreshing(force);
    loadMarketplace(force)
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRefreshing(false));
  }, []);
  useFocusEffect(useCallback(() => load(false), [load]));

  const installedIds = useMemo(() => new Set(plugins.map((p) => p.id)), [plugins]);
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (state?.registry.plugins ?? [])
      .filter((e) => filter === 'all' || e.kind === filter)
      .filter((e) => {
        if (!q) return true;
        // Match the shown (possibly English) text and the registry's own Chinese text.
        const shown = entryText(e, locale);
        return `${shown.name} ${shown.description} ${e.name} ${e.description} ${e.tags.join(' ')}`.toLowerCase().includes(q);
      });
  }, [state, filter, query, locale]);

  return (
    <Screen
      title={t('app.plugins.marketplace.title')}
      subtitle={t('app.plugins.marketplace.eyebrow')}
      back
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.surface} />}>
      <FadeIn index={0}>
        <View className="gap-3">
          <Text variant="callout" tone="muted">
            {t('app.plugins.marketplace.intro')}
          </Text>
          <View className="flex-row items-center gap-2 rounded-sm border-[0.5px] border-edge bg-surface-2 px-3">
            <Icon name="search" size={16} color={c.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('app.plugins.marketplace.search')}
              placeholderTextColor={c.textFaint}
              accessibilityLabel={t('app.plugins.marketplace.search')}
              className="flex-1 py-2 text-fg"
              style={{ fontFamily: fonts.regular, fontSize: typography.body.fontSize }}
            />
          </View>
          <Segmented options={filters} value={filter} onChange={setFilter} />
        </View>
      </FadeIn>
      {error && !state ? (
        <EmptyState icon="warning" title={t('app.plugins.marketplace.loadFailed')} message={error} action={<Button title={t('core.common.retry')} size="sm" variant="secondary" onPress={() => load(true)} />} />
      ) : !state ? (
        <View className="gap-3">
          <Skeleton height={140} rounded={radius.lg} />
          <Skeleton height={140} rounded={radius.lg} />
        </View>
      ) : (
        <View className="gap-3">
          {state.stale ? <Chip label={t('app.plugins.marketplace.offline')} tone="warn" icon="warning" /> : null}
          {entries.length === 0 ? <EmptyState icon="puzzle" title={t('app.plugins.marketplace.noMatch')} /> : null}
          {entries.map((e, i) => (
            <FadeIn key={e.id} index={i + 1}>
              <EntryCard entry={e} installed={installedIds.has(e.kind === 'builtin' ? e.id : `mcp-${e.id}`)} />
            </FadeIn>
          ))}
        </View>
      )}
    </Screen>
  );
}
