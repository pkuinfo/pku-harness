import { invokeTool } from '@/core/runtime/invoke';
import { readCache, writeCache } from '@/core/store/cache';

import { createLiveStore } from './live';

/** The app's live data store (see live.ts); data is fetched as the user, like a tap would. */
export const live = createLiveStore({
  load: (tool, args) => invokeTool(tool, args, { actor: 'user' }),
  read: readCache,
  write: writeCache,
  now: Date.now,
});
