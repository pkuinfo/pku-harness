import type { Binding } from './types';

/**
 * Stale-while-revalidate store for read-tool results (the TanStack Query model, sized for us).
 *
 * - One entry per tool + args, shared by every widget, plugin screen and scheduled check.
 * - The last value is persisted, so the dashboard opens with numbers, not skeletons.
 * - A value is stale after its TTL; stale *active* queries (mounted on a focused screen) are
 *   refetched on focus, on app foreground, and on a timer. `force` ignores the TTL.
 * - Concurrent requests for the same key share one promise; an error keeps the last value.
 * - `invalidate` marks matching entries stale (a write changed their source) and refetches the
 *   active ones right away.
 */

export const DEFAULT_TTL_MIN = 5;

export type Entry = {
  value?: unknown;
  fetchedAt?: number;
  error?: string;
  fetching: boolean;
  /** Persisted value read (or found missing). */
  hydrated: boolean;
  /** Invalidated by a write: refetch regardless of TTL. */
  stale?: boolean;
};

export type LiveDeps = {
  load(tool: string, args: Record<string, unknown>): Promise<unknown>;
  read(key: string): Promise<{ value: unknown; fetchedAt: number; stale?: boolean } | null>;
  write(key: string, value: unknown, fetchedAt: number, ttlMs: number): Promise<void>;
  /** Make persisted entries under a key prefix stale. */
  markStale(prefix: string): Promise<void>;
  now(): number;
};

type Query = Pick<Binding, 'tool' | 'args' | 'ttlMinutes'>;

export const queryKey = (q: Query) => `tool:${q.tool}:${JSON.stringify(q.args ?? {})}`;
export const ttlMs = (q: Query) => (q.ttlMinutes ?? DEFAULT_TTL_MIN) * 60_000;

export function isStale(e: Entry | undefined, ttl: number, now: number) {
  return !e || e.stale === true || e.fetchedAt == null || now - e.fetchedAt >= ttl;
}

export function createLiveStore(deps: LiveDeps) {
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<unknown>>();
  const hydrating = new Map<string, Promise<void>>();
  /** key → query + mount count (only focused screens register). */
  const active = new Map<string, { query: Query; count: number }>();
  const listeners = new Set<() => void>();
  let version = 0;

  const emit = () => {
    version++;
    listeners.forEach((l) => l());
  };
  const patch = (key: string, p: Partial<Entry>) => {
    entries.set(key, { fetching: false, hydrated: false, ...entries.get(key), ...p });
    emit();
  };

  function hydrate(key: string): Promise<void> {
    if (entries.get(key)?.hydrated) return Promise.resolve();
    let h = hydrating.get(key);
    if (!h) {
      h = deps
        .read(key)
        .catch(() => null)
        .then((row) => {
          const cur = entries.get(key);
          // A fetch may have landed first; never overwrite a newer value.
          if (row && (cur?.fetchedAt == null || cur.fetchedAt < row.fetchedAt)) patch(key, { value: row.value, fetchedAt: row.fetchedAt, hydrated: true, stale: row.stale });
          else patch(key, { hydrated: true });
        })
        .finally(() => hydrating.delete(key));
      hydrating.set(key, h);
    }
    return h;
  }

  /** The tool's result, from memory if fresh; otherwise fetched (deduped) and persisted. */
  async function fetch(q: Query, force = false): Promise<unknown> {
    const key = queryKey(q);
    await hydrate(key);
    const ttl = ttlMs(q);
    const e = entries.get(key);
    if (!force && !isStale(e, ttl, deps.now())) return e?.value;
    const pending = inflight.get(key);
    if (pending) return pending;
    patch(key, { fetching: true });
    const p = deps
      .load(q.tool, q.args ?? {})
      .then(async (value) => {
        const at = deps.now();
        patch(key, { value, fetchedAt: at, error: undefined, fetching: false, stale: false });
        await deps.write(key, value, at, ttl).catch(() => {});
        return value;
      })
      .catch((err: unknown) => {
        patch(key, { error: err instanceof Error ? err.message : String(err), fetching: false });
        throw err;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  /** Record a result obtained elsewhere (scheduled checks) so widgets show it too. */
  function prime(q: Query, value: unknown) {
    const key = queryKey(q);
    const at = deps.now();
    patch(key, { value, fetchedAt: at, error: undefined, hydrated: true, stale: false });
    void deps.write(key, value, at, ttlMs(q)).catch(() => {});
  }

  /** Register queries a focused screen shows; returns the release function. */
  function activate(queries: Query[]) {
    const keys = queries.map((q) => {
      const key = queryKey(q);
      const a = active.get(key);
      // Shortest TTL wins when two widgets share a source.
      if (a) {
        a.count++;
        if (ttlMs(q) < ttlMs(a.query)) a.query = q;
      } else active.set(key, { query: q, count: 1 });
      return key;
    });
    return () =>
      keys.forEach((key) => {
        const a = active.get(key);
        if (a && --a.count <= 0) active.delete(key);
      });
  }

  /** Refetch active queries that are stale (or all of them with `force`). */
  async function revalidateActive(force = false) {
    const now = deps.now();
    const jobs = [...active.values()]
      .filter(({ query }) => force || isStale(entries.get(queryKey(query)), ttlMs(query), now))
      .map(({ query }) => fetch(query, force).catch(() => {}));
    await Promise.all(jobs);
  }

  /**
   * Mark every entry of tools starting with `toolPrefix` (e.g. "calendar.") stale, in memory and
   * on disk, then refetch the ones on screen.
   */
  async function invalidate(toolPrefix: string) {
    const prefix = `tool:${toolPrefix}`;
    for (const [key, e] of entries) if (key.startsWith(prefix)) entries.set(key, { ...e, stale: true });
    emit();
    await deps.markStale(prefix).catch(() => {});
    await revalidateActive();
  }

  return {
    fetch,
    prime,
    invalidate,
    hydrate,
    activate,
    revalidateActive,
    get: (key: string) => entries.get(key),
    activeCount: () => active.size,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    version: () => version,
  };
}

export type LiveStore = ReturnType<typeof createLiveStore>;
