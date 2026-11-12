import type { PhoneLook, PhoneService } from '@pku-harness/sdk';
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

const UPDATE_FOR_VISION = 'This app version cannot show screenshots to the AI. Tell the user to update PKU harness.';

const isEnded = (value: unknown) => !!value && typeof value === 'object' && 'nativeError' in value
  && (value as { nativeError: { code: string } }).nativeError.code === 'ENDED';

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
    if (state.sessionId) {
      leases.claim(state.sessionId, signal);
      leases.confirm(state.sessionId, signal);
    }
    return state;
  },
  setup: (kind) => native().setup(kind),
  pair: (code, port) => native().pair(code, port ?? null),
  startPairing: () => native().startPairing(),
  stopPairing: () => native().stopPairing(),
  connect: (port) => native().connect(port ?? null),
  disconnect: () => native().disconnect(),
  apps: () => native().apps(),
  begin: (packages, signal) => leases.begin(() => native().begin(packages), signal),
  // Widens a running session only after a grant prompt (copilot.requestApp); the run must own it.
  allow: async (id, packageName, signal) => {
    signal?.throwIfAborted();
    leases.claim(id, signal);
    const module = native();
    // An OTA can reach an APK built before `allow` existed.
    if (typeof module.allow !== 'function') throw new Error('This app version cannot add apps to a running Copilot task. Update PKU harness, or tell the user to add the app in /copilot.');
    const result = await module.allow(id, packageName);
    signal?.throwIfAborted();
    return unwrap(result);
  },
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
  // Copilot's opt-in vision fallback. An OTA can reach an APK built before these existed.
  assessAt: async (id, snapshotId, x, y) => {
    const module = native();
    if (typeof module.assessAt !== 'function') throw new Error(UPDATE_FOR_VISION);
    return unwrap(await module.assessAt(id, snapshotId, x, y));
  },
  look: async (id, signal) => {
    signal?.throwIfAborted();
    const module = native();
    if (typeof module.assessAt !== 'function') throw new Error(UPDATE_FOR_VISION);
    leases.claim(id, signal);
    const result = await module.execute(id, 'look', {});
    signal?.throwIfAborted();
    if (isEnded(result)) leases.forgetStale(id, signal);
    else leases.confirm(id, signal);
    return unwrap(result) as unknown as PhoneLook;
  },
  execute: async (sessionId, operation, args, signal) => {
    signal?.throwIfAborted();
    const module = native();
    leases.claim(sessionId, signal);
    const result = await module.execute(sessionId, operation, args);
    signal?.throwIfAborted();
    if (isEnded(result)) leases.forgetStale(sessionId, signal);
    else leases.confirm(sessionId, signal);
    return unwrap(result);
  },
  end: (id, signal) => leases.end(id, signal),
  takeover: async (id, signal) => {
    leases.claim(id, signal);
    await native().takeover(id);
    signal?.throwIfAborted();
  },
  handoffAndWait: async (id, note, timeoutMs, signal) => {
    leases.claim(id, signal);
    const module = native();
    if (typeof module.handoff !== 'function' || typeof module.awaitHandback !== 'function') throw new Error('This app version cannot wait for a handoff. Use handoff without wait, and tell the user to update PKU harness.');
    await module.handoff(id, note);
    signal?.throwIfAborted();
    // The wait stops with the run: Stop in chat or the panel cancels it (the session then ends,
    // which also ends the native wait).
    let onAbort: (() => void) | undefined;
    const abort = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([module.awaitHandback(id, timeoutMs), abort]);
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  },
  handback: (id) => native().handback(id),
};
