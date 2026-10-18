import { services } from '@/core/runtime/invoke';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { kv } from '@/core/store/kv';

/**
 * Request context from plugins (e.g. memory) for one user turn. Each contributor gets a short
 * time budget; a slow or failing plugin is skipped rather than blocking the reply.
 */
export async function gatherContext(query: string): Promise<string> {
  const contributors = registry
    .list()
    .filter((p) => p.context && pluginSettings.get(p.id).enabled && !registry.unavailable(p.id));
  const parts = await Promise.all(
    contributors.map((p) =>
      Promise.race([
        p.context!({ query, kv: kv(`plugin:${p.id}`), services }).catch(() => undefined),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 800)),
      ]),
    ),
  );
  return parts.filter(Boolean).join('\n\n');
}
