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
import { loadMarketplace, type MarketState, type RegistryEntry } from '@/core/runtime/marketplace';
import { HOST_CAPABILITIES } from '@/core/runtime/registry';
import type { Capability } from '@/core/runtime/types';
import { fonts, radius, typography, useTheme } from '@/theme';

type Filter = 'all' | 'builtin' | 'remote';

const FILTERS: { label: string; value: Filter }[] = [
  { label: '全部', value: 'all' },
  { label: '内置', value: 'builtin' },
  { label: '远程', value: 'remote' },
];

function EntryCard({ entry, installed }: { entry: RegistryEntry; installed: boolean }) {
  const c = useTheme();
  const missing = entry.requires.filter((r) => !HOST_CAPABILITIES.has(r as Capability));
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
              {entry.name}
            </Text>
            {entry.verified ? <Icon name="shield" size={14} color={c.up} /> : null}
          </View>
          <Text variant="caption" tone="faint">
            {entry.author} · {entry.kind === 'builtin' ? '内置' : '远程 MCP'}
          </Text>
        </View>
      </View>
      <Text variant="callout" tone="muted">
        {entry.description}
      </Text>
      <View className="flex-row flex-wrap gap-1">
        {entry.tags.map((t) => (
          <Chip key={t} label={t} />
        ))}
        {missing.length ? <Chip label="此设备不支持" tone="warn" icon="warning" /> : null}
      </View>
      <View className="flex-row gap-2">
        <Button
          title={installed ? (entry.kind === 'builtin' ? '已内置' : '已安装') : entry.endpoint ? '安装' : '填写地址'}
          size="sm"
          variant={installed ? 'secondary' : 'primary'}
          onPress={action}
          disabled={!installed && missing.length > 0}
        />
        <Button title="源码" size="sm" variant="ghost" icon="globe" onPress={() => WebBrowser.openBrowserAsync(entry.source)} />
      </View>
    </View>
  );
}

/** 插件市场: every plugin in the community registry, built-in and remote side by side. */
export function Marketplace() {
  const c = useTheme();
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
      .filter((e) => !q || `${e.name} ${e.description} ${e.tags.join(' ')}`.toLowerCase().includes(q));
  }, [state, filter, query]);

  return (
    <Screen
      title="插件市场"
      subtitle="Community"
      back
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.surface} />}>
      <FadeIn index={0}>
        <View className="gap-3">
          <Text variant="callout" tone="muted">
            所有插件平等：内置的随应用发布，社区的通过 MCP 远程运行。想贡献？在 pkuinfo/pku-harness-plugins 提交 PR。
          </Text>
          <View className="flex-row items-center gap-2 rounded-sm border-[0.5px] border-edge bg-surface-2 px-3">
            <Icon name="search" size={16} color={c.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="搜索插件"
              placeholderTextColor={c.textFaint}
              accessibilityLabel="搜索插件"
              className="flex-1 py-2 text-fg"
              style={{ fontFamily: fonts.regular, fontSize: typography.body.fontSize }}
            />
          </View>
          <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        </View>
      </FadeIn>
      {error && !state ? (
        <EmptyState icon="warning" title="插件市场暂时打不开" message={error} action={<Button title="重试" size="sm" variant="secondary" onPress={() => load(true)} />} />
      ) : !state ? (
        <View className="gap-3">
          <Skeleton height={140} rounded={radius.lg} />
          <Skeleton height={140} rounded={radius.lg} />
        </View>
      ) : (
        <View className="gap-3">
          {state.stale ? <Chip label="离线：显示上次的列表" tone="warn" icon="warning" /> : null}
          {entries.length === 0 ? <EmptyState icon="puzzle" title="没有匹配的插件" /> : null}
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
