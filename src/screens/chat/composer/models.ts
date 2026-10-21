/**
 * Provider/model facts the composer and the model picker share (docs/AGENT-HARNESS.md §4.5).
 */
import { acceptsImages, modelInfo } from '@/core/agent/attachments/attachments';
import { aiConfig } from '@/core/agent/provider';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry, type ProviderEntry } from '@/core/runtime/registry';

import { shortModelName } from './logic';

/** Same rule as the active provider's readiness in provider.ts, for any provider. */
export function providerReady(entry: ProviderEntry): boolean {
  if (!pluginSettings.get(entry.pluginId).enabled) return false;
  if (entry.def.auth === 'none') return true;
  if (aiConfig.hasCredential(entry.id)) return true;
  return !!entry.def.editableBaseURL && !!aiConfig.settingsFor(entry.id).model;
}

/** Enabled providers, ready ones first (registry order otherwise). */
export function pickerProviders(): { entry: ProviderEntry; ready: boolean }[] {
  return registry
    .providers()
    .filter((e) => pluginSettings.get(e.pluginId).enabled)
    .map((entry) => ({ entry, ready: providerReady(entry) }))
    .sort((a, b) => Number(b.ready) - Number(a.ready));
}

/** Models a provider offers: its catalog, or the one configured for a catalog-less endpoint. */
export function providerModels(entry: ProviderEntry) {
  if (entry.def.models.length) return entry.def.models;
  const configured = aiConfig.settingsFor(entry.id).model;
  return configured ? [{ id: configured }] : [];
}

export function modelLabel(providerId: string, model: string): string {
  return shortModelName(model, modelInfo(providerId, model)?.name);
}

/** A ready model that takes images, to suggest when the current one doesn't (§4.2). */
export function imageModelSuggestion(): { providerId: string; model: string; label: string } | null {
  for (const { entry, ready } of pickerProviders()) {
    if (!ready) continue;
    const m = entry.def.models.find((x) => acceptsImages(entry.id, x.id));
    if (m) return { providerId: entry.id, model: m.id, label: shortModelName(m.id, m.name) };
  }
  return null;
}
