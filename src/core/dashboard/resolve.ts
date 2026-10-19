import { getPath } from '@/core/scheduler/check';

import { live } from './live-store';
import { setPointer } from './pointer';
import type { Binding, Widget } from './types';

/** One binding's value through the shared live store (TTL cache; `force` refetches). */
export async function resolveBinding(b: Binding, force = false): Promise<unknown> {
  return getPath(await live.fetch(b, force), b.path ?? '');
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
