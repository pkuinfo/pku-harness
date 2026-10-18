import { createStateStore, type Spec } from '@json-render/core';
import {
  ActionProvider,
  Renderer,
  StateProvider,
  ValidationProvider,
  VisibilityProvider,
} from '@json-render/react-native';
import { useMemo } from 'react';

import { invokeTool } from '@/core/runtime/invoke';

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
