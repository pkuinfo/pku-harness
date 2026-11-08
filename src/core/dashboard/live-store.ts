import { dayKey } from '@pku-harness/sdk';

import { invokeTool, onToolWrite } from '@/core/runtime/invoke';
import { registry } from '@/core/runtime/registry';
import { markStale, readCache, writeCache } from '@/core/store/cache';

import { createLiveStore } from './live';

/** The app's live data store (see live.ts); data is fetched as the user, like a tap would. */
export const live = createLiveStore({
  load: (tool, args) => invokeTool(tool, args, { actor: 'user' }),
  read: readCache,
  write: writeCache,
  markStale,
  now: Date.now,
  dayScoped: (tool) => registry.tool(tool)?.def.dayScoped === true,
  dayKey,
});

// A write through any plugin (e.g. calendar.syncSemester) makes that plugin's cached reads stale.
onToolWrite((pluginId) => void live.invalidate(`${pluginId}.`));
