import type { PhoneService } from '@pku-harness/sdk';
import PhoneControl from '../../../modules/phone-control';
import { PhoneSessionLease } from './session-lease';

function native() {
  if (!PhoneControl) throw new Error('Copilot needs an Android build with phone control.');
  return PhoneControl;
}

function unwrap<T>(value: T | { nativeError: { code: string; message: string } }): T {
  if (value && typeof value === 'object' && 'nativeError' in value) {
    const failure = value.nativeError;
    throw new Error(`${failure.code}: ${failure.message}`);
  }
  return value;
}

const leases = new PhoneSessionLease((id) => native().end(id), async (id, signal) => {
  const module = native();
  // A deliberate handoff survives a completed reply so the user can log in, then resume.
  // Stop/cancellation always tears down, including while the user has control.
  if (!signal.aborted) {
    const state = await module.readiness().catch(() => null);
    if (!signal.aborted && state?.sessionId === id && (state.handedOver || state.paused)) return;
  }
  await module.end(id);
});

/** Called only for native user Stop or loss of the control connection. */
export function stopPhoneRun(sessionId: string) { leases.stopRun(sessionId); }

export const phoneService: PhoneService = {
  readiness: async (signal) => {
    signal?.throwIfAborted();
    const state = await (PhoneControl?.readiness() ?? Promise.resolve({ supported: false, accessibility: false, helper: false, helperStatus: 'unavailable', locked: false, sessionId: null, packages: [], handedOver: false }));
    signal?.throwIfAborted();
    if (state.sessionId) leases.claim(state.sessionId, signal);
    return state;
  },
  setup: (kind) => native().setup(kind),
  pair: (code, port) => native().pair(code, port),
  connect: (port) => native().connect(port ?? null),
  disconnect: () => native().disconnect(),
  apps: () => native().apps(),
  begin: (packages, signal) => leases.begin(() => native().begin(packages), signal),
  preview: (id) => native().preview(id),
  readBrightness: async (id, signal) => {
    signal?.throwIfAborted();
    leases.claim(id, signal);
    const result = await native().readBrightness(id);
    signal?.throwIfAborted();
    return unwrap(result);
  },
  setBrightness: async (id, percent, adaptive, signal) => {
    signal?.throwIfAborted();
    leases.claim(id, signal);
    const result = await native().setBrightness(id, percent, adaptive ?? null);
    signal?.throwIfAborted();
    return unwrap(result);
  },
  assessSubmit: (id, snapshotId, ref) => native().assessSubmit(id, snapshotId, ref).then(unwrap),
  assessTap: (id, snapshotId, ref) => native().assessTap(id, snapshotId, ref).then(unwrap),
  execute: async (sessionId, operation, args, signal) => {
    signal?.throwIfAborted();
    const module = native();
    leases.claim(sessionId, signal);
    const result = await module.execute(sessionId, operation, args);
    signal?.throwIfAborted();
    return unwrap(result);
  },
  end: (id, signal) => leases.end(id, signal),
  takeover: async (id, signal) => {
    leases.claim(id, signal);
    await native().takeover(id);
    signal?.throwIfAborted();
  },
  handback: (id) => native().handback(id),
};
