import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { deliveryReadiness, type DeliveryReadiness } from '@/core/notify';

/**
 * Live on-time-delivery readiness (notifications, exact alarms, battery optimisation). These are
 * changed in system screens, so it re-reads whenever the app is back in the foreground. Null
 * until the first read.
 */
export function useDeliveryReadiness() {
  const [readiness, setReadiness] = useState<DeliveryReadiness | null>(null);
  const refresh = useCallback(async () => {
    const r = await deliveryReadiness().catch(() => null);
    if (r) setReadiness(r);
    return r;
  }, []);
  useEffect(() => {
    let live = true;
    deliveryReadiness()
      .then((r) => live && setReadiness(r))
      .catch(() => {});
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => {
      live = false;
      sub.remove();
    };
  }, [refresh]);
  return { readiness, refresh };
}
