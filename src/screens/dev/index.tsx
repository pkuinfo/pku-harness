import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { sendMessage } from '@/core/agent/run';
import { invokeTool } from '@/core/runtime/invoke';
import { askVerification } from '@/core/campus/verify';

/**
 * Dev-only tool runner so tools can be exercised on a device without a model:
 * `pkuharness://dev?tool=scheduler.create&input=<url-encoded JSON>`. Disabled in release.
 */
export function DevTools() {
  const { tool, input, n, actor, chat, verify } = useLocalSearchParams<{ tool?: string; input?: string; n?: string; actor?: 'user' | 'agent'; chat?: string; verify?: 'sms' | 'otp' | 'email' }>();
  const [out, setOut] = useState('');
  useEffect(() => {
    // `?chat=…` sends a message through the real agent pipeline and opens the chat tab.
    if (!__DEV__ || !chat) return;
    router.replace('/');
    sendMessage(chat);
  }, [chat, n]);
  useEffect(() => {
    // `?verify=sms|otp|email` previews the second-factor prompt with demo values (no network).
    if (!__DEV__ || !verify) return;
    void askVerification({ mode: verify, sentTo: verify === 'otp' ? undefined : '138****0000', service: '演示', resend: verify === 'otp' ? undefined : async () => '138****0000' }).then((code) => setOut(`code: ${code ?? '(cancelled)'}`));
  }, [verify, n]);
  useEffect(() => {
    if (!__DEV__ || !tool) return;
    Promise.resolve()
      .then(() => {
        // Clear the previous result so a reader never mistakes it for this tool's output.
        setOut('running…');
      })
      .then(() => invokeTool(tool, input ? JSON.parse(input) : {}, { actor: actor === 'agent' ? 'agent' : 'user' }))
      .then((r) => JSON.stringify(r, null, 2))
      .catch((e) => `error: ${e instanceof Error ? e.message : String(e)}`)
      .then((text) => {
        setOut(text);
        // Machine-readable copy for the device test runner (adb logcat), dev builds only.
        console.log(`[dev-tool] ${tool} n=${n ?? ''} ${JSON.stringify(text)}`);
      });
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
