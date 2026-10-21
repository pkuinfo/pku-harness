import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { getDb } from '@/core/store/db';

import type { Job } from '@pku-harness/sdk';

/**
 * Jobs live in the `jobs` table (full JSON in `data`, hot fields mirrored in columns) and in
 * an in-memory list that screens subscribe to.
 */

let jobs: Job[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function write(job: Job) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO jobs (id, kind, enabled, data, runs, last_run_at, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, enabled = excluded.enabled, data = excluded.data,
       runs = excluded.runs, last_run_at = excluded.last_run_at, next_run_at = excluded.next_run_at,
       updated_at = excluded.updated_at`,
    job.id,
    job.action.type,
    job.enabled ? 1 : 0,
    JSON.stringify(job),
    job.runs,
    job.lastRunAt,
    job.nextRunAt,
    job.createdAt,
    job.updatedAt,
  );
}

export const jobStore = {
  async load() {
    const db = await getDb();
    const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM jobs ORDER BY created_at');
    jobs = rows.map((r) => JSON.parse(r.data) as Job);
    loaded = true;
    emit();
  },
  isLoaded: () => loaded,
  list: () => jobs,
  get: (id: string) => jobs.find((j) => j.id === id),
  newId: () => Crypto.randomUUID(),
  async put(job: Job) {
    const i = jobs.findIndex((j) => j.id === job.id);
    jobs = i < 0 ? [...jobs, job] : jobs.map((j) => (j.id === job.id ? job : j));
    emit();
    await write(job);
  },
  async remove(id: string) {
    jobs = jobs.filter((j) => j.id !== id);
    emit();
    const db = await getDb();
    await db.runAsync('DELETE FROM jobs WHERE id = ?', id);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useJobs(): Job[] {
  return useSyncExternalStore(jobStore.subscribe, jobStore.list);
}
