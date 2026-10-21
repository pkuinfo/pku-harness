import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { ListGroup, ListRow } from '@/components/list-group';
import { SheetScreen } from '@/components/sheet-screen';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import type { McpServerInfo, McpTool } from '@/core/mcp/client';
import { effectOf, probeRemote, remotePlugins } from '@/core/runtime/remote';
import { useT } from '@/i18n';
import { haptics } from '@/utils/haptics';

import { effectInfo } from './effects';

/** Settings → 插件 → 添加远程插件: connect to an MCP endpoint, review its tools, install. */
export function AddRemotePlugin({ initialUrl = '', initialName = '' }: { initialUrl?: string; initialName?: string }) {
  const t = useT();
  const [url, setUrl] = useState(initialUrl);
  const [token, setToken] = useState('');
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ server: McpServerInfo | null; tools: McpTool[] } | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await probeRemote(url, token || undefined);
      setProbe(p);
      if (!name) setName(p.server?.title ?? p.server?.name ?? '');
      haptics.success();
    } catch (e) {
      setProbe(null);
      setError(e instanceof Error ? e.message : String(e));
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    setBusy(true);
    try {
      const m = await remotePlugins.install({ url, token: token || undefined, name: name || undefined });
      haptics.success();
      router.replace({ pathname: '/plugins/[id]', params: { id: m.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <SheetScreen
      title={t('app.plugins.addRemote.title')}
      primary={probe ? t('app.plugins.addRemote.install') : t('app.plugins.addRemote.connect')}
      onPrimary={probe ? install : connect}
      primaryDisabled={!/^https?:\/\/.+/.test(url.trim())}
      loading={busy}>
      <Text variant="callout" tone="muted">
        {t('app.plugins.addRemote.intro')}
      </Text>
      <Field
        label={t('app.plugins.addRemote.url')}
        value={url}
        onChangeText={(v) => {
          setUrl(v);
          setProbe(null);
        }}
        placeholder="https://example.com/mcp"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Field label={t('app.plugins.addRemote.token')} value={token} onChangeText={setToken} placeholder="Bearer token" secureTextEntry autoCapitalize="none" />
      {error ? (
        <Surface level={2}>
          <Text variant="callout" tone="down">
            {error}
          </Text>
        </Surface>
      ) : null}
      {probe ? (
        <View className="gap-4">
          <Field label={t('app.plugins.addRemote.name')} value={name} onChangeText={setName} />
          <ListGroup title={t('app.plugins.addRemote.tools', { server: probe.server?.name ?? t('app.plugins.addRemote.server'), count: probe.tools.length })}>
            {probe.tools.map((tool) => {
              const e = effectOf(tool);
              return (
                <ListRow
                  key={tool.name}
                  title={tool.title ?? tool.annotations?.title ?? tool.name}
                  subtitle={tool.description}
                  accessory={<Chip label={effectInfo(e, t).label} tone={effectInfo(e, t).tone} />}
                />
              );
            })}
          </ListGroup>
        </View>
      ) : null}
    </SheetScreen>
  );
}
