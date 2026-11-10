import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { invokeTool } from '@/core/runtime/invoke';

type CopilotStatus = { enabled?: boolean; setupMissing?: string[] };

/**
 * Whether Copilot is set up and on (null while reading). Re-read whenever the screen is shown again,
 * e.g. back from Copilot's own setup screen. A disabled or missing Copilot plugin reads as false.
 */
export function useCopilotReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      invokeTool('copilot.status', {}, { actor: 'user' })
        .then((s) => {
          const status = s as CopilotStatus;
          if (alive) setReady(!!status.enabled && !status.setupMissing?.length);
        })
        .catch(() => alive && setReady(false));
      return () => {
        alive = false;
      };
    }, []),
  );
  return ready;
}
