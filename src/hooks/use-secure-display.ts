import * as Brightness from 'expo-brightness';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * While mounted: block screenshots / screen recording, and optionally raise this app's screen
 * brightness (for codes a scanner must read). Android only overrides the activity brightness
 * (no WRITE_SETTINGS); iOS gets its previous value back.
 */
export function useSecureDisplay({ brightness = false }: { brightness?: boolean } = {}) {
  usePreventScreenCapture('secure-display');
  useEffect(() => {
    if (!brightness) return;
    let previous: number | null = null;
    void (async () => {
      try {
        if (Platform.OS === 'ios') previous = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
      } catch {
        // Brightness is a nicety; the code still shows.
      }
    })();
    return () => {
      if (Platform.OS === 'android') void Brightness.restoreSystemBrightnessAsync().catch(() => {});
      else if (previous != null) void Brightness.setBrightnessAsync(previous).catch(() => {});
    };
  }, [brightness]);
}
