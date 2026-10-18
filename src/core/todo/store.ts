import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { getDb } from '@/core/store/db';

export type Todo = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: number | null;
  doneAt: number | null;
  /** Reminder job in the scheduler, if any. */
  jobId: string | null;
  createdAt: number;
};

type Row = { id: string; title: string; notes: string | null; due_at: number | null; done_at: number | null; job_id: string | null; created_at: number };

const fromRow = (r: Row): Todo => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  dueAt: r.due_at,
  doneAt: r.done_at,
  jobId: r.job_id,
  createdAt: r.created_at,
});

let todos: Todo[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Open first (by due date, undated last), then done (most recent first). */
export function sortTodos(list: Todo[]): Todo[] {
  return [...list].sort((a, b) => {
    if (!!a.doneAt !== !!b.doneAt) return a.doneAt ? 1 : -1;
    if (a.doneAt && b.doneAt) return b.doneAt - a.doneAt;
    if (a.dueAt != null && b.dueAt != null) return a.dueAt - b.dueAt;
    if (a.dueAt != null || b.dueAt != null) return a.dueAt != null ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

export const todoStore = {
  async load() {
    const db = await getDb();
    todos = sortTodos((await db.getAllAsync<Row>('SELECT * FROM todos')).map(fromRow));
    emit();
  },
  list: () => todos,
  get: (id: string) => todos.find((t) => t.id === id),
  newId: () => Crypto.randomUUID(),
  async put(t: Todo) {
    const exists = todos.some((x) => x.id === t.id);
    todos = sortTodos(exists ? todos.map((x) => (x.id === t.id ? t : x)) : [...todos, t]);
    emit();
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO todos (id, title, notes, due_at, done_at, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, notes = excluded.notes, due_at = excluded.due_at,
         done_at = excluded.done_at, job_id = excluded.job_id`,
      t.id,
      t.title,
      t.notes,
      t.dueAt,
      t.doneAt,
      t.jobId,
      t.createdAt,
    );
  },
  async remove(id: string) {
    todos = todos.filter((t) => t.id !== id);
    emit();
    const db = await getDb();
    await db.runAsync('DELETE FROM todos WHERE id = ?', id);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useTodos(): Todo[] {
  return useSyncExternalStore(todoStore.subscribe, todoStore.list);
}
