import type { ModelMessage } from 'ai';

import { services } from '@/core/runtime/invoke';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { kv } from '@/core/store/kv';
import { getLocale } from '@/i18n';

import { byStability, languageLine, languageSnapshot, newFacts, visibleContext } from './assembly';
import { beijingTimeLine } from './prompt-time';

/**
 * Request context for one user turn (the `<context>` block at the start of the user message;
 * docs/AGENT-HARNESS.md §5.1). Per-turn facts live here, not in the system prompt, so the prompt
 * stays a stable cacheable prefix. Fixed order: the current Beijing time (always), the reply
 * language (only when it changed), then plugin contributors by stability (assembly.ts). Facts the
 * model can already see in `history` are not repeated (`newFacts`). Each contributor gets a short
 * time budget; a slow or failing plugin is skipped rather than blocking the reply.
 */
export async function gatherContext(query: string, history: readonly ModelMessage[], now = new Date()): Promise<string> {
  const seen = visibleContext(history);
  const contributors = registry
    .list()
    .filter((p) => p.context && pluginSettings.get(p.id).enabled && !registry.unavailable(p.id))
    .sort(byStability);
  const parts = await Promise.all(
    contributors.map((p) =>
      Promise.race([
        p.context!({ query, kv: kv(`plugin:${p.id}`), services }).catch(() => undefined),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 800)),
      ]),
    ),
  );
  const fresh = parts.map((part) => (part ? newFacts(part, seen) : undefined));
  return [beijingTimeLine(now), languageSnapshot(languageLine(getLocale()), seen), ...fresh].filter(Boolean).join('\n\n');
}
