import { Host } from '@expo/ui';
import type { ComponentProps } from 'react';

import { useTheme, useThemeName } from '@/theme';

/**
 * Host for @expo/ui universal components (Jetpack Compose on Android, SwiftUI on iOS),
 * themed from our tokens: Material/SwiftUI colours derive from the PKU-red accent and
 * follow the app's light/dark preference rather than only the system setting.
 */
export function NativeHost(props: ComponentProps<typeof Host>) {
  const c = useTheme();
  const name = useThemeName();
  return <Host matchContents colorScheme={name} seedColor={c.accent} {...props} />;
}
