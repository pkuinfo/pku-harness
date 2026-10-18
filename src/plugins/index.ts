import type { PluginDef } from '@/core/runtime/types';

import { uiPlugin } from './ui';

/** Plugins shipped inside the app bundle. Order = order in Settings and the system prompt. */
export const builtinPlugins: PluginDef[] = [uiPlugin];
