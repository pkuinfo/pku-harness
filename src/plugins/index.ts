import type { PluginDef } from '@/core/runtime/types';

import { calendarPlugin } from './calendar';
import { dashboardPlugin } from './dashboard';
import { deepseekPlugin } from './deepseek';
import { openAICompatiblePlugin } from './openai-compatible';
import { pluginsPlugin } from './plugins';
import { schedulerPlugin } from './scheduler';
import { timetablePlugin } from './timetable';
import { todoPlugin } from './todo';
import { uiPlugin } from './ui';

/** Plugins shipped inside the app bundle. Order = order in Settings and the system prompt. */
export const builtinPlugins: PluginDef[] = [uiPlugin, dashboardPlugin, schedulerPlugin, todoPlugin, timetablePlugin, calendarPlugin, pluginsPlugin, deepseekPlugin, openAICompatiblePlugin];
