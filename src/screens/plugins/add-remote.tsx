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
import { haptics } from '@/utils/haptics';

import { EFFECTS } from './effects';

/** Settings → 插件 → 添加远程插件: connect to an MCP endpoint, review its tools, install. */
export function AddRemotePlugin({ initialUrl = '', initialName = '' }: { initialUrl?: string; initialName?: string }) {
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
      title="添加远程插件"
      primary={probe ? '安装' : '连接'}
      onPrimary={probe ? install : connect}
      primaryDisabled={!/^https?:\/\/.+/.test(url.trim())}
      loading={busy}>
      <Text variant="callout" tone="muted">
        远程插件是第三方通过 MCP 协议提供的服务。它只能收到你授权给它的输入，拿不到校园密码；除读取外的操作默认每次询问你。
      </Text>
      <Field
        label="MCP 地址"
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
      <Field label="访问令牌（可选）" value={token} onChangeText={setToken} placeholder="Bearer token" secureTextEntry autoCapitalize="none" />
      {error ? (
        <Surface level={2}>
          <Text variant="callout" tone="down">
            {error}
          </Text>
        </Surface>
      ) : null}
      {probe ? (
        <View className="gap-4">
          <Field label="名称" value={name} onChangeText={setName} />
          <ListGroup title={`${probe.server?.name ?? '服务'} · ${probe.tools.length} 个能力`}>
            {probe.tools.map((t) => {
              const e = effectOf(t);
              return (
                <ListRow
                  key={t.name}
                  title={t.title ?? t.annotations?.title ?? t.name}
                  subtitle={t.description}
                  accessory={<Chip label={EFFECTS[e].label} tone={EFFECTS[e].tone} />}
                />
              );
            })}
          </ListGroup>
        </View>
      ) : null}
    </SheetScreen>
  );
}
