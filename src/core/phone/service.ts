import type { PhoneService } from '@pku-harness/sdk';
import PhoneControl from '../../../modules/phone-control';
import { PhoneSessionLease } from './session-lease';

function native() {
  if (!PhoneControl) throw new Error('Copilot needs an Android build with phone control.');
  return PhoneControl;
}

const leases = new PhoneSessionLease((id) => native().end(id), async (id, signal) => {
  const module = native();
  // A deliberate handoff survives a completed reply so the user can log in, then resume.
  // Stop/cancellation always tears down, including while the user has control.
  if (!signal.aborted) {
    const state = await module.readiness().catch(() => null);
    if (!signal.aborted && state?.sessionId === id && state.handedOver) return;
  }
  await module.end(id);
});

export const phoneService: PhoneService = {
  readiness: () => PhoneControl?.readiness() ?? Promise.resolve({ supported: false, accessibility: false, helper: false, helperStatus: 'unavailable', locked: false, sessionId: null, packages: [], handedOver: false }),
  setup: (kind) => native().setup(kind),
  pair: (code, port) => native().pair(code, port),
  connect: (port) => native().connect(port ?? null),
  disconnect: () => native().disconnect(),
  apps: () => native().apps(),
  begin: (packages) => native().begin(packages),
  preview: (id) => native().preview(id),
  assessTap: (id, snapshotId, ref) => native().assessTap(id, snapshotId, ref),
  execute: async (sessionId, operation, args, signal) => {
    signal?.throwIfAborted();
    const module = native();
    leases.claim(sessionId, signal);
    const result = await module.execute(sessionId, operation, args);
    signal?.throwIfAborted();
    return result;
  },
  end: (id, signal) => leases.end(id, signal),
  takeover: async (id, signal) => {
    leases.claim(id, signal);
    await native().takeover(id);
    signal?.throwIfAborted();
  },
  handback: (id) => native().handback(id),
};
