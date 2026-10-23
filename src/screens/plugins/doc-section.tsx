import { router } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeSwitch } from '@/components/native-switch';
import { docPlugins } from '@/core/runtime/doc-plugins';
import { services } from '@/core/runtime/invoke';
import { useT } from '@/i18n';
import { haptics } from '@/utils/haptics';

const useDoc = (id: string) => useSyncExternalStore(docPlugins.subscribe, () => docPlugins.get(id));

/**
 * The plugin page's section for plugin documents (docs/PLUGIN-LANGUAGE.md §10): where it comes
 * from, its version, updates (automatic unless pinned; wider access waits for the user),
 * rollback and removal.
 */
export function DocSection({ id }: { id: string }) {
  const t = useT();
  const d = useDoc(id);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!d) return null;

  const check = async () => {
    setChecking(true);
    setNote(null);
    try {
      const changed = await docPlugins.checkUpdates({ force: true, id });
      const now = docPlugins.get(id);
      setNote(changed.length && now && !now.pending ? t('app.plugins.doc.updated', { version: now.version }) : changed.length ? null : t('app.plugins.doc.upToDate'));
      haptics.success();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      haptics.warning();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View className="gap-4">
      <ListGroup title={t('app.plugins.doc.source')} footer={d.source === 'bundled' ? t('app.plugins.doc.bundled') : d.link ? t('app.plugins.doc.autoUpdateFooter') : undefined}>
        <ListRow icon="fileText" title={t('app.plugins.doc.version', { version: d.version })} subtitle={d.link ?? undefined} titleLines={1} />
        {d.link ? <ListRow icon="globe" title={t('app.plugins.doc.openSource')} chevron onPress={() => services.browser.open(d.link!).catch(() => haptics.warning())} /> : null}
        {d.pending ? (
          <ListRow
            icon="shield"
            title={t('app.plugins.doc.pending', { version: d.pending.version })}
            subtitle={t('app.plugins.doc.pendingReview')}
            chevron
            onPress={() => router.push({ pathname: '/plugins/add', params: { link: d.link! } })}
          />
        ) : null}
        {d.link ? <ListRow icon="refresh" title={checking ? '…' : t('app.plugins.doc.checkUpdates')} value={note ?? undefined} onPress={checking ? undefined : check} /> : null}
        {d.link ? (
          <ListRow
            icon="sync"
            title={t('app.plugins.doc.autoUpdate')}
            accessory={<NativeSwitch value={!d.pinned} onValueChange={(on) => void docPlugins.setPinned(id, !on)} label={t('app.plugins.doc.autoUpdate')} />}
          />
        ) : null}
        {d.previous ? (
          <ListRow
            icon="undo"
            title={t('app.plugins.doc.rollback', { version: d.previous.version })}
            onPress={async () => {
              await docPlugins.rollback(id);
              haptics.success();
            }}
          />
        ) : null}
      </ListGroup>
      {d.source !== 'bundled' ? (
        <Button
          title={t('app.plugins.detail.remove')}
          variant="danger"
          icon="trash"
          onPress={async () => {
            haptics.warning();
            await docPlugins.uninstall(id);
            router.back();
          }}
        />
      ) : null}
    </View>
  );
}
