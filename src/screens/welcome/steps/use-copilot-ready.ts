import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { invokeTool } from '@/core/runtime/invoke';

type CopilotStatus = { enabled?: boolean; setupMissing?: string[] };

/**
 * Copilot's setup state, re-read whenever the screen is shown again (e.g. back from Copilot's own
 * setup screen or Android's accessibility settings). `missing` lists the setup steps still needed
 * (helper, accessibility, apps, enable), null while reading. A disabled or missing Copilot plugin
 * reads as not ready.
 */
export function useCopilotSetup(): { ready: boolean | null; missing: string[] | null; refresh: () => void } {
  const [status, setStatus] = useState<{ ready: boolean | null; missing: string[] | null }>({ ready: null, missing: null });
  const [tick, setTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      invokeTool('copilot.status', {}, { actor: 'user' })
        .then((s) => {
          const st = s as CopilotStatus;
          const missing = st.setupMissing ?? [];
          if (alive) setStatus({ ready: !!st.enabled && !missing.length, missing });
        })
        .catch(() => alive && setStatus({ ready: false, missing: ['helper', 'accessibility', 'apps', 'enable'] }));
      return () => {
        alive = false;
      };
    }, [tick]),
  );
  return { ...status, refresh: useCallback(() => setTick((n) => n + 1), []) };
}

/** Whether Copilot is set up and on (null while reading). */
export function useCopilotReady(): boolean | null {
  return useCopilotSetup().ready;
}
