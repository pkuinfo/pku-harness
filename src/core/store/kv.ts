import { getDb } from './db';

/** Namespaced JSON key-value store backed by SQLite. Plugins get their own namespace. */
export function kv(ns: string) {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const db = await getDb();
      const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE ns = ? AND key = ?', ns, key);
      return row ? (JSON.parse(row.value) as T) : undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO kv (ns, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(ns, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        ns,
        key,
        JSON.stringify(value),
        Date.now(),
      );
    },
    async delete(key: string): Promise<void> {
      const db = await getDb();
      await db.runAsync('DELETE FROM kv WHERE ns = ? AND key = ?', ns, key);
    },
  };
}

export type KV = ReturnType<typeof kv>;
