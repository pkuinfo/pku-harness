import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { sendMessage } from '@/core/agent/run';
import { invokeTool } from '@/core/runtime/invoke';

/**
 * Dev-only tool runner so tools can be exercised on a device without a model:
 * `pkuharness://dev?tool=scheduler.create&input=<url-encoded JSON>`. Disabled in release.
 */
export function DevTools() {
  const { tool, input, n, actor, chat } = useLocalSearchParams<{ tool?: string; input?: string; n?: string; actor?: 'user' | 'agent'; chat?: string }>();
  const [out, setOut] = useState('');
  useEffect(() => {
    // `?chat=…` sends a message through the real agent pipeline and opens the chat tab.
    if (!__DEV__ || !chat) return;
    router.replace('/');
    sendMessage(chat);
  }, [chat, n]);
  useEffect(() => {
    if (!__DEV__ || !tool) return;
    Promise.resolve()
      .then(() => invokeTool(tool, input ? JSON.parse(input) : {}, { actor: actor === 'agent' ? 'agent' : 'user' }))
      .then((r) => setOut(JSON.stringify(r, null, 2)))
      .catch((e) => setOut(`error: ${e instanceof Error ? e.message : String(e)}`));
  }, [tool, input, n, actor]);
  return (
    <Screen title="Dev" subtitle={tool ?? 'no tool'} back>
      <Surface>
        <Text variant="caption" selectable>
          {__DEV__ ? out || '…' : 'Disabled in release builds.'}
        </Text>
      </Surface>
    </Screen>
  );
}
