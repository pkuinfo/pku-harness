import { getDb } from './db';

/** TTL cache for read-tool results (src/core/dashboard/live.ts persists through it). */
export async function invalidate(prefix: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM cache WHERE key LIKE ?', `${prefix}%`);
}

/** The stored entry, fresh or not (for stale-while-revalidate). */
export async function readCache<T>(key: string): Promise<{ value: T; fetchedAt: number } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string; fetched_at: number }>('SELECT value, fetched_at FROM cache WHERE key = ?', key);
  return row ? { value: JSON.parse(row.value) as T, fetchedAt: row.fetched_at } : null;
}

export async function writeCache(key: string, value: unknown, fetchedAt: number, ttlMs: number) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO cache (key, value, fetched_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at',
    key,
    JSON.stringify(value),
    fetchedAt,
    fetchedAt + ttlMs,
  );
}
