import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

import { themes, type ThemeColors, type ThemeName } from './colors';

export type ThemePreference = 'system' | ThemeName;

let preference: ThemePreference = 'system';
const listeners = new Set<() => void>();

/** Set the user's theme preference. Persisted by the settings store (src/core/store). */
export function setThemePreference(next: ThemePreference) {
  preference = next;
  listeners.forEach((l) => l());
}

export function getThemePreference() {
  return preference;
}

export function subscribeThemePreference(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePreference() {
  return useSyncExternalStore(subscribeThemePreference, getThemePreference);
}

export function useThemeName(): ThemeName {
  const pref = useThemePreference();
  const system = useColorScheme();
  if (pref !== 'system') return pref;
  return system === 'light' ? 'light' : 'dark';
}

/** Active semantic colours. */
export function useTheme(): ThemeColors {
  return themes[useThemeName()];
}
