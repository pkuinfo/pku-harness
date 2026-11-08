import { useSyncExternalStore } from 'react';

import { clockZone, isZoneId, setClockZone, subscribeClockZone, type ClockZone } from '@pku-harness/sdk';

import { kv } from '@/core/store/kv';

/**
 * App-level time-zone setting. One choice feeds the SDK's `clock.ts`, so the agent's "current
 * time" line, the scheduler, to-dos, timetable, ledger and the Schedule tab all move together —
 * a setting that moved only the agent clock would silently disagree with the dates the user sees.
 *
 * - `auto` (the default) = follow the system's zone, wherever the phone is.
 * - otherwise any IANA zone id (`Asia/Shanghai`, `America/New_York`, …). The SDK reads its
 *   offset per instant through Intl, so daylight saving is exact.
 *
 * The live SDK clock zone is the single source of truth; this module maps it to/from the stored
 * choice and persists it, so there is no second variable to drift.
 */
export type TimezonePreference = 'auto' | (string & {});

const PREF_KEY = 'timezone';

const zoneFor = (p: TimezonePreference): ClockZone => (p === 'auto' ? 'device' : { id: p });

/** The current choice, derived from the live clock zone. */
export function getTimezonePreference(): TimezonePreference {
  const z = clockZone();
  return z === 'device' ? 'auto' : z.id;
}

/** Change the zone for every layer at once (Settings calls this). An unknown id is ignored. */
export function setTimezonePreference(next: TimezonePreference) {
  if (next !== 'auto' && !isZoneId(next)) return;
  setClockZone(zoneFor(next));
}

/** A saved value from an older build: `beijing` was the only fixed choice. */
const migrate = (saved: string) => (saved === 'beijing' ? 'Asia/Shanghai' : saved);

/**
 * Load the saved choice and apply it. Must run before any wall-clock data loads (timetable,
 * jobs, ledger) so those buckets use the right zone from the first read — see boot.ts. A zone
 * this runtime can't resolve falls back to following the system.
 */
export async function loadTimezonePreference() {
  const saved = await kv('prefs').get<string>(PREF_KEY);
  if (!saved) return;
  const pref = migrate(saved);
  if (pref !== 'auto' && isZoneId(pref)) setClockZone(zoneFor(pref));
}

/** Persist the choice on every change. Call once at boot; returns the unsubscribe. */
export function persistTimezonePreference() {
  return subscribeClockZone(() => kv('prefs').set(PREF_KEY, getTimezonePreference()));
}

/** Re-render on a zone change (UI that reads the choice). */
export function useTimezonePreference(): TimezonePreference {
  return useSyncExternalStore(subscribeClockZone, getTimezonePreference);
}

/** The system's own zone id (what `auto` follows right now), or null if the runtime can't tell. */
export function systemZoneId(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
