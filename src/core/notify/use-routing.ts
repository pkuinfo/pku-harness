import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

/** Open the route in a tapped notification's `data.url` (cold start and while running). */
export function useNotificationRouting() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const url = last.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) {
      router.push(url as never);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }
  }, [last]);
}
