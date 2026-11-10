import { useEffect } from 'react';
import { AppState } from 'react-native';
import PhoneControl from '../../../modules/phone-control';
import { approvals } from '../runtime/approvals';
import { registry } from '../runtime/registry';
import { toolTitle } from '../runtime/localize';
import { OverlayWriter } from './overlay-writer';
import { stopPhoneRun } from './service';

const writer = new OverlayWriter();
let started = false;

/**
 * Mirror the existing approval queue into native controls while Harness is backgrounded. Runs for
 * the life of the JS runtime, not of a screen: Back destroys the activity and unmounts React while
 * the agent keeps working, and its approvals must still reach the floating controls.
 */
export function startOverlayApprovals() {
  const native = PhoneControl;
  if (!native || started) return;
  started = true;
  const owner = writer.attach(() => native.overlayApproval(null));
  const mirror = async (current: () => boolean) => {
    const req = approvals.current();
    const input = req?.input as Record<string, unknown> | undefined;
    const state = await native.readiness();
    if (!current()) return;
    const eligible = AppState.currentState !== 'active' && req?.entry.pluginId === 'copilot'
      && typeof input?.sessionId === 'string' && input.sessionId === state.sessionId;
    const detail = [req?.assessment?.target?.label, req?.assessment?.target?.context,
      ...Object.entries(input ?? {}).filter(([key]) => !['sessionId', 'snapshotId', 'ref'].includes(key))
        .map(([key, value]) => `${key}: ${String(value).slice(0, 300)}`)].filter(Boolean).join('\n');
    await native.overlayApproval(eligible ? {
      id: req.id, sessionId: input.sessionId as string,
      title: toolTitle(registry.get(req.entry.pluginId), req.entry.name, req.entry.def.title), detail,
    } : null);
  };
  const sync = () => { void owner.update(mirror); };
  // Retry missed writes/clears without superseding a slower in-flight read or native call.
  setInterval(() => { void owner.retry(mirror); }, 2000);
  native.addListener('onControlStopped', ({ sessionId }) => stopPhoneRun(sessionId));
  native.addListener('onOverlayAnswer', (event) => {
    const req = approvals.current();
    const input = req?.input as Record<string, unknown> | undefined;
    if (req?.id === event.id && req.entry.pluginId === 'copilot' && input?.sessionId === event.sessionId) {
      void approvals.answer(req.id, event.allowed);
    }
  });
  approvals.subscribe(sync);
  AppState.addEventListener('change', sync);
  sync();
}

/** Starts the mirror from the root layout; it outlives the component. */
export function useOverlayApprovals() {
  useEffect(() => startOverlayApprovals(), []);
}
