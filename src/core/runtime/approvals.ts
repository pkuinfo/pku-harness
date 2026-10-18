import { useSyncExternalStore } from 'react';

import { setAskHandler } from './invoke';
import { pluginSettings } from './plugin-settings';
import type { ToolEntry } from './registry';

/**
 * Pending "ask first" approvals (docs/ARCHITECTURE.md §5). `invokeTool` awaits the user's
 * answer for agent calls whose effect is set to 'ask'; the root layout renders the prompt.
 */

export type Approval = { id: number; entry: ToolEntry; input: unknown };

let queue: Approval[] = [];
const resolvers = new Map<number, (ok: boolean) => void>();
const listeners = new Set<() => void>();
let nextId = 1;
const emit = () => listeners.forEach((l) => l());

export const approvals = {
  current: () => queue[0] ?? null,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Answer the front request. `always` switches that plugin's effect to 'auto'. */
  async answer(id: number, ok: boolean, always = false) {
    const req = queue.find((a) => a.id === id);
    if (!req) return;
    queue = queue.filter((a) => a.id !== id);
    emit();
    if (ok && always) {
      const s = pluginSettings.get(req.entry.pluginId);
      await pluginSettings.update(req.entry.pluginId, { modes: { ...s.modes, [req.entry.def.effect]: 'auto' } });
    }
    resolvers.get(id)?.(ok);
    resolvers.delete(id);
  },
};

/** Install the UI ask handler (app only; the background runtime has none, so it declines). */
export function installApprovalHandler() {
  setAskHandler(
    (entry, input) =>
      new Promise<boolean>((resolve) => {
        const id = nextId++;
        resolvers.set(id, resolve);
        queue = [...queue, { id, entry, input }];
        emit();
      }),
  );
}

export function useApproval(): Approval | null {
  return useSyncExternalStore(approvals.subscribe, approvals.current);
}
