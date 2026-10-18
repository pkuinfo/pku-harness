import { aiConfig } from '@/core/agent/provider';
import { chatStore } from '@/core/agent/chat-store';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { builtinPlugins } from '@/plugins';

let booted: Promise<void> | null = null;

/** Register built-in plugins and hydrate persisted state. Idempotent. */
export function boot(): Promise<void> {
  if (!booted) {
    booted = (async () => {
      for (const p of builtinPlugins) registry.register(p);
      await Promise.all([pluginSettings.load(), aiConfig.load(), chatStore.load()]);
    })();
  }
  return booted;
}
