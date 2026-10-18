import { useCallback, useEffect, useRef, useState } from 'react';

import { invokeTool } from '@/core/runtime/invoke';
import { getPath } from '@/core/scheduler/check';
import { cached } from '@/core/store/cache';

import { setPointer } from './pointer';
import type { Binding, Widget } from './types';

const DEFAULT_TTL_MIN = 5;

/** Same tool + args share one cache entry across widgets and checks. */
const cacheKey = (b: Binding) => `tool:${b.tool}:${JSON.stringify(b.args ?? {})}`;

export async function resolveBinding(b: Binding, force = false): Promise<unknown> {
  const ttl = (b.ttlMinutes ?? DEFAULT_TTL_MIN) * 60_000;
  const result = await cached(cacheKey(b), ttl, () => invokeTool(b.tool, b.args ?? {}, { actor: 'user' }), force);
  return getPath(result, b.path ?? '');
}

/** Spec state with every binding's value written at its pointer. Throws on the first failure. */
export async function resolveWidgetState(w: Widget, force = false): Promise<Record<string, unknown>> {
  let state = ((w.spec as { state?: Record<string, unknown> }).state ?? {}) as Record<string, unknown>;
  const entries = Object.entries(w.bindings);
  const values = await Promise.all(entries.map(([, b]) => resolveBinding(b, force)));
  entries.forEach(([pointer], i) => {
    state = setPointer(state, pointer, values[i]);
  });
  return state;
}

export type WidgetData =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; state: Record<string, unknown>; refreshing: boolean };

/** Loading / error / ready for one widget. `refreshToken` changes force a refetch. */
export function useWidgetData(w: Widget, refreshToken: number) {
  const [data, setData] = useState<WidgetData>({ status: 'loading' });
  const first = useRef(true);
  const load = useCallback(
    (force: boolean) => {
      setData((d) => (d.status === 'ready' ? { ...d, refreshing: true } : { status: 'loading' }));
      resolveWidgetState(w, force)
        .then((state) => setData({ status: 'ready', state, refreshing: false }))
        .catch((e) => setData({ status: 'error', error: e instanceof Error ? e.message : String(e) }));
    },
    [w],
  );
  useEffect(() => {
    const force = !first.current;
    first.current = false;
    // Defer so the state update is not synchronous inside the effect.
    const t = setTimeout(() => load(force), 0);
    return () => clearTimeout(t);
  }, [load, refreshToken]);
  return { data, retry: () => load(true) };
}
