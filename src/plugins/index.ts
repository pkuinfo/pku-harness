import type { PluginDef } from '@/core/runtime/types';

import { calendarPlugin } from './calendar';
import { dashboardPlugin } from './dashboard';
import { schedulerPlugin } from './scheduler';
import { uiPlugin } from './ui';

/** Plugins shipped inside the app bundle. Order = order in Settings and the system prompt. */
export const builtinPlugins: PluginDef[] = [uiPlugin, dashboardPlugin, schedulerPlugin, calendarPlugin];
