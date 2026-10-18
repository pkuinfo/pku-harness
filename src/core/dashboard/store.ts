import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { getDb } from '@/core/store/db';

import type { Widget } from './types';

/** Widgets in the `widgets` table, ordered by position; screens subscribe to the list. */

let widgets: Widget[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const sorted = (list: Widget[]) => [...list].sort((a, b) => a.position - b.position);

async function write(w: Widget) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO widgets (id, position, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET position = excluded.position, data = excluded.data, updated_at = excluded.updated_at`,
    w.id,
    w.position,
    JSON.stringify(w),
    w.updatedAt,
  );
}

export const widgetStore = {
  async load() {
    const db = await getDb();
    const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM widgets ORDER BY position');
    widgets = sorted(rows.map((r) => JSON.parse(r.data) as Widget));
    emit();
  },
  list: () => widgets,
  get: (id: string) => widgets.find((w) => w.id === id),
  newId: () => Crypto.randomUUID().slice(0, 8),
  async put(w: Widget) {
    const exists = widgets.some((x) => x.id === w.id);
    widgets = sorted(exists ? widgets.map((x) => (x.id === w.id ? w : x)) : [...widgets, w]);
    emit();
    await write(w);
  },
  async remove(id: string) {
    widgets = widgets.filter((w) => w.id !== id);
    emit();
    const db = await getDb();
    await db.runAsync('DELETE FROM widgets WHERE id = ?', id);
  },
  /** Persist a new order (ids first-to-last); unknown ids are ignored, missing ones keep their relative order at the end. */
  async reorder(ids: string[]) {
    const rank = new Map(ids.map((id, i) => [id, i]));
    const next = [...widgets]
      .sort((a, b) => (rank.get(a.id) ?? ids.length + a.position) - (rank.get(b.id) ?? ids.length + b.position))
      .map((w, i) => ({ ...w, position: i }));
    widgets = next;
    emit();
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const w of next) await db.runAsync('UPDATE widgets SET position = ?, data = ? WHERE id = ?', w.position, JSON.stringify(w), w.id);
    });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useWidgets(): Widget[] {
  return useSyncExternalStore(widgetStore.subscribe, widgetStore.list);
}
