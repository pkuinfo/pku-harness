import { createStateStore, type Spec } from '@json-render/core';
import {
  ActionProvider,
  Renderer,
  StateProvider,
  ValidationProvider,
  VisibilityProvider,
} from '@json-render/react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';

import { sendMessage } from '@/core/agent/run';
import { invokeTool, services } from '@/core/runtime/invoke';

import { registry } from './registry';

export type GenUIHandlers = {
  /** Called by the `submit` action with the current form state. */
  onSubmit?: (form: Record<string, unknown>, label?: string) => void;
};

/** Renders an agent-produced spec with our catalog, state and action handlers. */
export function GenUIView({ spec, onSubmit }: { spec: Spec } & GenUIHandlers) {
  const store = useMemo(() => createStateStore((spec as { state?: Record<string, unknown> }).state ?? {}), [spec]);
  const handlers = useMemo(
    () => ({
      submit: async (params: Record<string, unknown>) => {
        const form = (store.get('/form') as Record<string, unknown> | undefined) ?? {};
        onSubmit?.(form, typeof params?.label === 'string' ? params.label : undefined);
      },
      callTool: async (params: Record<string, unknown>) => {
        await invokeTool(String(params.tool), params.input ?? {}, { actor: 'user' });
      },
      ask: async (params: Record<string, unknown>) => {
        const text = String(params.text ?? '').trim();
        if (!text) return;
        router.navigate('/');
        sendMessage(text);
      },
      open: async (params: Record<string, unknown>) => {
        const url = String(params.url ?? '');
        if (/^https:\/\//i.test(url)) await services.browser.open(url);
      },
      navigate: async (params: Record<string, unknown>) => {
        const href = String(params.href ?? '');
        if (href.startsWith('/')) router.push(href as never);
      },
    }),
    [store, onSubmit],
  );
  return (
    <StateProvider store={store}>
      <VisibilityProvider>
        <ActionProvider handlers={handlers}>
          <ValidationProvider>
            <Renderer spec={spec} registry={registry} />
          </ValidationProvider>
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
