/**
 * Plugin names and tool titles as the chat shows them: in the app language, through the plugin's
 * English overlay (src/core/runtime/localize.ts).
 */
import { pluginName, toolTitle } from '@/core/runtime/localize';
import { registry } from '@/core/runtime/registry';
import { getLocale, type Locale } from '@/i18n';

/** `wallet.cardBalance` → "查询校园卡余额" / "Check card balance"; unknown ids as is. */
export function toolLabel(toolId: string, locale: Locale = getLocale()): string {
  const entry = registry.tool(toolId);
  return entry ? toolTitle(registry.get(entry.pluginId), entry.name, entry.def.title, locale) : toolId;
}

/** The plugin that owns a tool, by name; undefined when the tool is unknown. */
export function toolPluginLabel(toolId: string, locale: Locale = getLocale()): string | undefined {
  const entry = registry.tool(toolId);
  const plugin = entry ? registry.get(entry.pluginId) : undefined;
  return plugin ? pluginName(plugin, locale) : undefined;
}
