import { useSyncExternalStore } from 'react';

import { setAskHandler } from './invoke';
import { ApprovalQueue } from './approval-queue';
import { pluginSettings } from './plugin-settings';
import type { ToolEntry } from './registry';
import type { ToolAssessment } from './types';

/**
 * Pending "ask first" approvals (docs/ARCHITECTURE.md §5). `invokeTool` awaits the user's
 * answer for agent calls whose effect is set to 'ask'; the root layout renders the prompt.
 */

export type Approval = { id: number; entry: ToolEntry; input: unknown; assessment?: ToolAssessment };

const requests = new ApprovalQueue<Omit<Approval, 'id'>>();

export const approvals = {
  current: requests.current,
  subscribe: requests.subscribe,
  /** Answer the front request. `always` switches that plugin's effect to 'auto'. */
  async answer(id: number, ok: boolean, always = false) {
    const req = requests.get(id);
    if (!req) return;
    await requests.answer(id, ok, always ? async () => {
      const s = pluginSettings.get(req.entry.pluginId);
      await pluginSettings.update(req.entry.pluginId, { modes: { ...s.modes, [req.entry.def.effect]: 'auto' } });
    } : undefined);
  },
};

/** Install the UI ask handler (app only; the background runtime has none, so it declines). */
export function installApprovalHandler() {
  setAskHandler((entry, input, signal, assessment) => requests.enqueue({ entry, input, assessment }, signal));
}

export function useApproval(): Approval | null {
  return useSyncExternalStore(approvals.subscribe, approvals.current);
}
