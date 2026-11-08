import { router } from 'expo-router';

import { ListGroup, ListRow } from '@/components/list-group';
import { useT } from '@/i18n';
import { summarize } from '@/screens/plugins/status';
import { usePluginEntries } from '@/screens/plugins/use-plugin-status';

/** One settings row opens plugin controls; live counts remain visible without a decorative grid. */
export function PluginsEntry() {
  const t = useT();
  const entries = usePluginEntries();
  const { on, signIn } = summarize(entries.map((entry) => entry.status));
  const summary = [t('app.settings.pluginsOn', { count: on }), signIn ? t('app.settings.pluginsSignIn', { count: signIn }) : ''].filter(Boolean).join(t('app.ui.listSep'));
  return (
    <ListGroup>
      <ListRow icon="puzzle" title={t('app.settings.plugins')} subtitle={summary} onPress={() => router.push('/plugins')} />
    </ListGroup>
  );
}
