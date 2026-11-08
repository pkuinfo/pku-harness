/** Host resources acquired by tools live through model thinking, but never past their run. */
const resources = new WeakMap<AbortSignal, Set<() => Promise<void>>>();

export function registerRunResource(signal: AbortSignal, release: () => Promise<void>): () => void {
  signal.throwIfAborted();
  let pending: Promise<void> | undefined;
  const close = () => pending ??= Promise.resolve().then(release);
  const abort = () => { void close().catch(() => {}); };
  const entries = resources.get(signal) ?? new Set();
  resources.set(signal, entries);
  const cleanup = async () => {
    signal.removeEventListener('abort', abort);
    await close();
  };
  entries.add(cleanup);
  signal.addEventListener('abort', abort, { once: true });
  return () => {
    signal.removeEventListener('abort', abort);
    entries.delete(cleanup);
    if (entries.size === 0) resources.delete(signal);
  };
}

/** Attempt every release; a failed cleanup must not erase the completed chat response. */
export async function releaseRunResources(signal: AbortSignal): Promise<void> {
  const entries = resources.get(signal);
  resources.delete(signal);
  if (entries) await Promise.allSettled([...entries].map((close) => close()));
}
