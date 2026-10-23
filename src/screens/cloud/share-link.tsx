import { Redirect } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { parkedShareLink } from '@/core/cloud/incoming';
import { usePlugins } from '@/core/runtime/hooks';
import { usePluginSettings } from '@/core/runtime/plugin-settings';
import type { PluginDef } from '@/core/runtime/types';
import { useT } from '@/i18n';

/** Preferred viewer for share links; any plugin with a channel viewer page + `view` screen also qualifies. */
const PREFERRED = 'card-share';

function claims(p: PluginDef) {
  return !!p.cloud?.uses.includes('channels') && !!p.contributes?.screens?.view;
}

/**
 * Route an opened share link to the plugin that shows it (its `view` screen gets `params.share`,
 * which the screen host resolves to `params.link`). Nothing installed claims it, or the link
 * lost its key on the way: say so.
 */
export function ShareLinkRoute({ channelId, handle }: { channelId: string; handle?: string }) {
  const t = useT();
  const plugins = usePlugins();
  const owner = plugins.find((p) => p.id === PREFERRED && claims(p)) ?? plugins.find(claims);
  const enabled = usePluginSettings(owner?.id ?? PREFERRED).enabled;
  const link = parkedShareLink(handle);

  if (owner && enabled && link) {
    return <Redirect href={{ pathname: '/m/[plugin]/[screen]', params: { plugin: owner.id, screen: 'view', share: handle } }} />;
  }
  return (
    <Screen title={t('app.cloud.share.title')} back>
      <EmptyState
        icon="share"
        title={!link ? t('app.cloud.share.brokenTitle') : t('app.cloud.share.noViewerTitle')}
        message={!link ? t('app.cloud.share.brokenMessage') : owner ? t('app.cloud.share.viewerOff') : t('app.cloud.share.noViewerMessage', { id: channelId })}
      />
    </Screen>
  );
}
