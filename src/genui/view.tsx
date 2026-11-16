import { createStateStore, type Spec } from '@json-render/core';
import {
  ActionProvider,
  Renderer,
  StateProvider,
  ValidationProvider,
  VisibilityProvider,
} from '@json-render/react-native';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { sendMessage } from '@/core/agent/run';
import { refreshAll } from '@/core/dashboard/live-hooks';
import { invokeTool, services } from '@/core/runtime/invoke';

import { FeedScroll } from './feed';
import { loadMore } from './load-more';
import { registry } from './registry';

export type GenUIHandlers = {
  /** Called by the `submit` action with the current form state. */
  onSubmit?: (form: Record<string, unknown>, label?: string) => void;
  /** A feed screen: the view scrolls itself, with pull to refresh and endless lists (EndReached). */
  feed?: boolean;
};

/** State the user owns: kept when the spec's data refreshes (a half-typed form, results of actions). */
const USER_STATE = new Set(['form', 'result', 'error']);

/**
 * Renders a spec with our catalog, state and action handlers. The state store lives as long as the
 * view: when the spec's state changes (a widget or plugin screen whose bindings refreshed), only
 * the data keys are updated, so what the user typed survives a refresh.
 */
export function GenUIView({ spec, onSubmit, feed }: { spec: Spec } & GenUIHandlers) {
  // One store for the life of the view (created from the first spec's state).
  const [store] = useState(() => createStateStore((spec as { state?: Record<string, unknown> }).state ?? {}));
  useEffect(() => {
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries((spec as { state?: Record<string, unknown> }).state ?? {})) if (!USER_STATE.has(key)) updates[`/${key}`] = value;
    store.update(updates);
  }, [spec, store]);
  // Lists grown by loadMore (list → status path), cleared on pull to refresh.
  const grown = useRef(new Map<string, string>());
  const handlers = useMemo(
    () => ({
      loadMore: async (params: Record<string, unknown>) => {
        const statusPath = typeof params.statusPath === 'string' ? params.statusPath : null;
        const list = await loadMore(store, params, (tool, input) => invokeTool(tool, input, { actor: 'user' }));
        if (list && statusPath) grown.current.set(list, statusPath);
      },
      submit: async (params: Record<string, unknown>) => {
        const form = (store.get('/form') as Record<string, unknown> | undefined) ?? {};
        onSubmit?.(form, typeof params?.label === 'string' ? params.label : undefined);
      },
      // Run a tool as the user. `resultPath` / `errorPath` put the outcome into state (e.g. to show
      // "code sent"); bound data on screen refreshes afterwards, so a toggle shows its new state.
      callTool: async (params: Record<string, unknown>) => {
        const at = (key: string) => (typeof params[key] === 'string' && String(params[key]).startsWith('/') ? String(params[key]) : null);
        try {
          const result = await invokeTool(String(params.tool), params.input ?? {}, { actor: 'user' });
          if (at('resultPath')) store.set(at('resultPath')!, result);
          if (at('errorPath')) store.set(at('errorPath')!, null);
          // Done with what the user typed (a sent reply): clear it, only after success.
          if (Array.isArray(params.clear)) for (const p of params.clear) if (typeof p === 'string' && p.startsWith('/')) store.set(p, null);
        } catch (e) {
          if (!at('errorPath')) throw e;
          store.set(at('errorPath')!, e instanceof Error ? e.message : String(e));
        }
        await refreshAll();
      },
      // One-tap SMS code: the user allows reading the next SMS; its code goes to `statePath`.
      smsCode: async (params: Record<string, unknown>) => {
        const path = String(params.statePath ?? '/form/code');
        const code = await services.sms.awaitCode();
        if (code && path.startsWith('/')) store.set(path, code);
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
  const view = <Renderer spec={spec} registry={registry} />;
  return (
    <StateProvider store={store}>
      <VisibilityProvider>
        <ActionProvider handlers={handlers}>
          <ValidationProvider>
            {feed ? (
              <FeedScroll
                onRefresh={async () => {
                  // Back to page 1: the grown lists start over from the fresh first page.
                  for (const [list, status] of grown.current) store.update({ [list]: [], [status]: {} });
                  await refreshAll();
                }}>
                {view}
              </FeedScroll>
            ) : (
              view
            )}
          </ValidationProvider>
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
