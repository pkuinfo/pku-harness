import { requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

import type { GLContext } from './hero-scene';

export type GLViewProps = ViewProps & { onContextCreate: (gl: GLContext) => void };

/**
 * expo-gl's view, or null when this binary has no ExpoGL native module (a dev client built
 * before it was added). Resolved lazily, so a missing module means the 2D mark instead of a crash
 * when the welcome screen loads.
 */
export const GLView: ComponentType<GLViewProps> | null = (() => {
  if (!requireOptionalNativeModule('ExpoGL')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-gl') as { GLView: ComponentType<GLViewProps> }).GLView;
  } catch {
    return null;
  }
})();
