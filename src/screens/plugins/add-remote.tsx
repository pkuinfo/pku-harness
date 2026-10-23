import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { ListGroup, ListRow } from '@/components/list-group';
import { SheetScreen } from '@/components/sheet-screen';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import type { McpServerInfo, McpTool } from '@/core/mcp/client';
import { docPlugins, type DocPreview } from '@/core/runtime/doc-plugins';
import { effectOf, probeRemote, remotePlugins } from '@/core/runtime/remote';
import { useT } from '@/i18n';
import { haptics } from '@/utils/haptics';

import { effectInfo } from './effects';

/** A link that points at a plugin document rather than an MCP server. */
const looksLikeDocument = (s: string) => /github\.com\/|raw\.githubusercontent\.com\/|PLUGIN\.md(\?|#|$)|^pkuharness:\/\/plugin/i.test(s.trim());

/** What a plugin document can reach and do, shown before installing (docs/PLUGIN-LANGUAGE.md §9). */
export function DocPermissions({ preview }: { preview: DocPreview }) {
  const t = useT();
  const m = preview.doc.manifest;
  const tools = Object.values(preview.doc.tools);
  const nothing = !m.campus?.length && !m.network?.length && !m.abilities?.length;
  return (
    <View className="gap-4">
      <Surface level={2}>
        <View className="gap-1.5">
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="headline" numberOfLines={1}>
              {m.name}
            </Text>
            <Chip label={preview.verified ? t('app.plugins.doc.official') : t('app.plugins.doc.community')} tone={preview.verified ? 'accent' : 'neutral'} icon={preview.verified ? 'shield' : 'globe'} />
          </View>
          <Text variant="caption" tone="muted">
            {t('app.plugins.doc.byline', { author: m.author, version: m.version })}
          </Text>
          <Text variant="callout">{m.description}</Text>
        </View>
      </Surface>
      <ListGroup title={t('app.plugins.doc.reaches')} footer={m.campus?.length ? t('app.plugins.doc.campusNote') : undefined}>
        {m.campus?.length ? <ListRow icon="school" title={t('app.plugins.doc.campus')} subtitle={m.campus.join('、')} /> : null}
        {m.network?.length ? <ListRow icon="globe" title={t('app.plugins.doc.network')} subtitle={m.network.join('、')} /> : null}
        {m.abilities?.length ? <ListRow icon="wand" title={t('app.plugins.doc.abilities')} subtitle={m.abilities.join('、')} /> : null}
        {nothing ? <ListRow icon="lock" title={t('app.plugins.doc.nothing')} /> : null}
      </ListGroup>
      <ListGroup title={t('app.plugins.doc.tools', { count: tools.length })} footer={preview.verified ? undefined : t('app.plugins.doc.communityNote')}>
        {tools.map((tool) => (
          <ListRow key={tool.title} title={tool.title} subtitle={tool.description} titleLines={1} accessory={<Chip label={effectInfo(tool.effect, t).label} tone={effectInfo(tool.effect, t).tone} />} />
        ))}
      </ListGroup>
    </View>
  );
}

/**
 * Settings → 插件 → 添加: one link box for both kinds of shared plugin. A PLUGIN.md link (GitHub
 * folder, raw URL, pkuharness://plugin) is fetched, validated and reviewed before install; any
 * other URL is treated as an MCP endpoint, as before.
 */
export function AddRemotePlugin({ initialUrl = '', initialName = '', draft }: { initialUrl?: string; initialName?: string; draft?: string }) {
  const t = useT();
  const [url, setUrl] = useState(initialUrl);
  const [token, setToken] = useState('');
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(!!draft);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ server: McpServerInfo | null; tools: McpTool[] } | null>(null);
  const [doc, setDoc] = useState<DocPreview | null>(null);
  const isDoc = looksLikeDocument(url) || !!draft;

  // A draft the AI wrote (plugins.install { files }): review it right away; links wait for "Check".
  useEffect(() => {
    if (!draft) return;
    const files = docPlugins.takeDraft(draft);
    (files ? docPlugins.previewFiles(files) : Promise.reject(new Error(t('app.plugins.doc.notFound'))))
      .then(
        (p) => setDoc(p),
        (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setBusy(false));
  }, [draft, t]);

  const reset = () => {
    setProbe(null);
    setDoc(null);
    setError(null);
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      if (looksLikeDocument(url)) setDoc(await docPlugins.preview(url));
      else {
        try {
          const p = await probeRemote(url, token || undefined);
          setProbe(p);
          if (!name) setName(p.server?.title ?? p.server?.name ?? '');
        } catch (mcpError) {
          // Not an MCP server: maybe a self-hosted PLUGIN.md folder.
          try {
            setDoc(await docPlugins.preview(url));
          } catch {
            throw mcpError;
          }
        }
      }
      haptics.success();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    setBusy(true);
    try {
      const id = doc ? (await docPlugins.install(doc)).id : (await remotePlugins.install({ url, token: token || undefined, name: name || undefined })).id;
      haptics.success();
      router.replace({ pathname: '/plugins/[id]', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const ready = !!(doc || probe);
  return (
    <SheetScreen
      title={t('app.plugins.doc.title')}
      primary={ready ? (doc?.replaces ? t('app.plugins.doc.reinstall') : t('app.plugins.doc.install')) : t('app.plugins.doc.check')}
      onPrimary={ready ? install : check}
      primaryDisabled={!doc && url.trim().length < 8}
      loading={busy}>
      <Text variant="callout" tone="muted">
        {t('app.plugins.doc.intro')}
      </Text>
      {draft ? null : (
      <Field
        label={t('app.plugins.doc.link')}
        value={url}
        onChangeText={(v) => {
          setUrl(v);
          reset();
        }}
        placeholder={t('app.plugins.doc.linkPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      )}
      {!isDoc && !doc ? (
        <Field label={t('app.plugins.addRemote.token')} value={token} onChangeText={setToken} placeholder="Bearer token" secureTextEntry autoCapitalize="none" />
      ) : null}
      {error ? (
        <Surface level={2}>
          <Text variant="callout" tone="down" selectable>
            {error}
          </Text>
        </Surface>
      ) : null}
      {doc ? <DocPermissions preview={doc} /> : null}
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
