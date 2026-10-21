import { services } from '@/core/runtime/invoke';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { kv } from '@/core/store/kv';

import { beijingTimeLine } from './prompt-time';

/**
 * Request context for one user turn (the `<context>` block). The first line is always the current
 * Beijing time: per-turn facts live here, not in the system prompt, so the prompt stays a stable
 * cacheable prefix (docs/AGENT-HARNESS.md §5.1). Then each plugin contributor (e.g. memory) gets a
 * short time budget; a slow or failing plugin is skipped rather than blocking the reply.
 */
export async function gatherContext(query: string, now = new Date()): Promise<string> {
  const contributors = registry
    .list()
    .filter((p) => p.context && pluginSettings.get(p.id).enabled && !registry.unavailable(p.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const parts = await Promise.all(
    contributors.map((p) =>
      Promise.race([
        p.context!({ query, kv: kv(`plugin:${p.id}`), services }).catch(() => undefined),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 800)),
      ]),
    ),
  );
  return [beijingTimeLine(now), ...parts.filter(Boolean)].join('\n\n');
}
