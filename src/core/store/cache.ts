import { getDb } from './db';

/** TTL cache for plugin data sources (dashboard bindings, checks). */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, force = false): Promise<T> {
  const db = await getDb();
  const now = Date.now();
  if (!force) {
    const row = await db.getFirstAsync<{ value: string; expires_at: number }>(
      'SELECT value, expires_at FROM cache WHERE key = ?',
      key,
    );
    if (row && row.expires_at > now) return JSON.parse(row.value) as T;
  }
  const value = await load();
  await db.runAsync(
    'INSERT INTO cache (key, value, fetched_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at',
    key,
    JSON.stringify(value),
    now,
    now + ttlMs,
  );
  return value;
}

export async function invalidate(prefix: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM cache WHERE key LIKE ?', `${prefix}%`);
}
