import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { LiveData } from '@/core/runtime/types';
import { getPath } from '@/core/scheduler/check';

import { queryKey } from './live';
import { live } from './live-store';
import { setPointer } from './pointer';
import type { Binding, Widget } from './types';

/** Visible stale queries are rechecked this often; each query's TTL decides if it refetches. */
const TICK_MS = 30_000;

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void live.revalidateActive();
  });
  setInterval(() => {
    if (AppState.currentState === 'active' && live.activeCount() > 0) void live.revalidateActive();
  }, TICK_MS);
}

const useLiveVersion = () => useSyncExternalStore(live.subscribe, live.version);

/**
 * Live values for bindings: registered while the screen is focused (so hidden tabs never poll),
 * fetched on focus when stale, shown from the persisted cache meanwhile.
 */
export function useBindings(bindings: Binding[]): LiveData<unknown[]> {
  wire();
  const version = useLiveVersion();
  const sig = JSON.stringify(bindings.map(({ tool, args, path, ttlMinutes }) => ({ tool, args, path, ttlMinutes })));
  const queries = useMemo(() => JSON.parse(sig) as Binding[], [sig]);

  useFocusEffect(
    useCallback(() => {
      const release = live.activate(queries);
      queries.forEach((q) => void live.fetch(q).catch(() => {}));
      return release;
    }, [queries]),
  );

  // `version` is passed in (not just listed as a dep) so the React Compiler keeps it as an input.
  return useMemo(() => snapshot(queries, version), [queries, version]);
}

function snapshot(queries: Binding[], _version: number): LiveData<unknown[]> {
  const es = queries.map((q) => live.get(queryKey(q)));
  const missing = es.some((e) => e?.fetchedAt == null);
  const error = es.find((e) => e?.error)?.error;
  const times = es.map((e) => e?.fetchedAt).filter((t): t is number => t != null);
  return {
    status: missing ? (error ? 'error' : 'loading') : 'ready',
    value: missing ? undefined : queries.map((q, i) => getPath(es[i]?.value, q.path ?? '')),
    error,
    updatedAt: times.length ? Math.min(...times) : undefined,
    fetching: es.some((e) => e?.fetching),
    refresh: async () => {
      await Promise.all(queries.map((q) => live.fetch(q, true).catch(() => {})));
    },
  };
}

export function useToolData<T = unknown>(tool: string, args?: Record<string, unknown>, opts?: { ttlMinutes?: number; path?: string }): LiveData<T> {
  const d = useBindings([{ tool, args, ttlMinutes: opts?.ttlMinutes, path: opts?.path }]);
  return { ...d, value: d.value?.[0] as T | undefined };
}

/** An AI-built widget's spec state with each binding's value written at its pointer. */
export function useWidgetData(w: Pick<Widget, 'spec' | 'bindings'>): LiveData<Record<string, unknown>> {
  const entries = Object.entries(w.bindings);
  const d = useBindings(entries.map(([, b]) => b));
  const base = (w.spec as { state?: Record<string, unknown> }).state;
  const pointers = entries.map(([p]) => p).join('\n');
  const value = useMemo(() => fill(base, pointers, d.value), [base, pointers, d.value]);
  return { ...d, value };
}

function fill(base: Record<string, unknown> | undefined, pointers: string, values: unknown[] | undefined) {
  if (!values) return undefined;
  let state = base ?? {};
  pointers.split('\n').forEach((pointer, i) => {
    if (pointer) state = setPointer(state, pointer, values[i]);
  });
  return state;
}

/** Pull-to-refresh: force every query on screen. */
export const refreshAll = () => live.revalidateActive(true);

const pad = (n: number) => String(n).padStart(2, '0');

export function formatAgo(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const d = new Date(ms);
  const today = new Date(now);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === today.toDateString()) return hm;
  const y = new Date(now - 86400_000);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}
