import { useSyncExternalStore } from 'react';

import { clockZone, setClockZone, subscribeClockZone, type ClockZone } from '@pku-harness/sdk';

import { kv } from '@/core/store/kv';

/**
 * App-level time-zone setting. One choice feeds the SDK's `clock.ts`, so the agent's "current
 * time" line, the scheduler, to-dos, timetable, ledger and the Schedule tab all move together —
 * a setting that moved only the agent clock would silently disagree with the dates the user sees
 * (see docs / memory: timezone-beijing-vs-device).
 *
 * - `auto` = follow the phone's own zone (the default; correct for virtually every PKU user).
 * - `beijing` = pin to campus time (Asia/Shanghai, +08:00) for a student whose phone is abroad.
 *
 * The live SDK clock zone is the single source of truth; this module maps it to/from the stored
 * choice and persists it, so there is no second variable to drift.
 */
export type TimezonePreference = 'auto' | 'beijing';

/** Asia/Shanghai has no DST, so a constant +480-minute offset is exact. */
const BEIJING_ID = 'Asia/Shanghai';
const BEIJING: ClockZone = { id: BEIJING_ID, offsetMinutes: 480 };

const zoneFor = (p: TimezonePreference): ClockZone => (p === 'beijing' ? BEIJING : 'device');

/** The current choice, derived from the live clock zone. */
export function getTimezonePreference(): TimezonePreference {
  const z = clockZone();
  return z !== 'device' && z.id === BEIJING_ID ? 'beijing' : 'auto';
}

/** Change the zone for every layer at once (Settings calls this). */
export function setTimezonePreference(next: TimezonePreference) {
  setClockZone(zoneFor(next));
}

/**
 * Load the saved choice and apply it. Must run before any wall-clock data loads (timetable,
 * jobs, ledger) so those buckets use the right zone from the first read — see boot.ts.
 */
export async function loadTimezonePreference() {
  const saved = await kv('prefs').get<TimezonePreference>('timezone');
  if (saved) setClockZone(zoneFor(saved));
}

/** Persist the choice on every change. Call once at boot; returns the unsubscribe. */
export function persistTimezonePreference() {
  return subscribeClockZone(() => kv('prefs').set('timezone', getTimezonePreference()));
}

/** Re-render on a zone change (UI that reads the choice). */
export function useTimezonePreference(): TimezonePreference {
  return useSyncExternalStore(subscribeClockZone, getTimezonePreference);
}
