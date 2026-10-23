import { router } from 'expo-router';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { useT } from '@/i18n';

/** Shown for a route or deep link the app doesn't know (instead of the router's default page). */
export function NotFoundScreen() {
  const t = useT();
  return (
    <Screen title={t('app.notFound.title')} back>
      <EmptyState
        icon="help"
        title={t('app.notFound.heading')}
        message={t('app.notFound.message')}
        action={<Button title={t('app.notFound.home')} icon="chat" onPress={() => router.replace('/')} />}
      />
    </Screen>
  );
}
