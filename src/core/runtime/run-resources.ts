/** Native stop controls can cancel the exact run that owns their resource. */
const cancellations = new WeakMap<AbortSignal, () => void>();
export function registerRunCancellation(signal: AbortSignal, cancel: () => void): void {
  cancellations.set(signal, cancel);
}
export function cancelResourceRun(signal: AbortSignal): void {
  cancellations.get(signal)?.();
}

/**
 * Host resources acquired by tools live through model thinking, but never past their run, unless
 * the run is steered: then they pass to the chat's next run (`holdRunResources`, `transferRunResources`).
 */
type Entry = { cleanup: () => Promise<void>; detach: () => void; transfer?: (to: AbortSignal) => void };
const resources = new WeakMap<AbortSignal, Set<Entry>>();
const held = new WeakSet<AbortSignal>();

/** `transfer` takes the resource over to another run (it registers itself there); without it, a steer releases it. */
export function registerRunResource(signal: AbortSignal, release: () => Promise<void>, transfer?: (to: AbortSignal) => void): () => void {
  signal.throwIfAborted();
  let pending: Promise<void> | undefined;
  const close = () => pending ??= Promise.resolve().then(release);
  const abort = () => { void close().catch(() => {}); };
  const entries = resources.get(signal) ?? new Set();
  resources.set(signal, entries);
  const detach = () => signal.removeEventListener('abort', abort);
  const entry: Entry = {
    cleanup: async () => {
      detach();
      await close();
    },
    detach,
    transfer,
  };
  entries.add(entry);
  signal.addEventListener('abort', abort, { once: true });
  return () => {
    detach();
    entries.delete(entry);
    if (entries.size === 0) resources.delete(signal);
  };
}

/**
 * The run is about to stop for a steer (the user sent a queued message now): its abort must not
 * release its resources, which wait for `transferRunResources` to the next run. Call before aborting.
 */
export function holdRunResources(signal: AbortSignal): void {
  held.add(signal);
  for (const entry of resources.get(signal) ?? []) entry.detach();
}

/** Hand a held run's resources to the next run; one that can't move is released. */
export function transferRunResources(from: AbortSignal, to: AbortSignal): void {
  const entries = resources.get(from);
  resources.delete(from);
  held.delete(from);
  cancellations.delete(from);
  for (const entry of entries ?? []) {
    if (entry.transfer) entry.transfer(to);
    else void entry.cleanup().catch(() => {});
  }
}

/** A held run's resources found no next run: release them after all. */
export async function dropHeldRunResources(signal: AbortSignal): Promise<void> {
  held.delete(signal);
  await releaseRunResources(signal);
}

/** Attempt every release; a failed cleanup must not erase the completed chat response. */
export async function releaseRunResources(signal: AbortSignal): Promise<void> {
  cancellations.delete(signal);
  // Steered: kept for the next run.
  if (held.has(signal)) return;
  const entries = resources.get(signal);
  resources.delete(signal);
  if (entries) await Promise.allSettled([...entries].map((entry) => entry.cleanup()));
}
