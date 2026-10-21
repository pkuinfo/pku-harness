/**
 * Price lookup from the plugin registry (`ProviderModel.pricing`): the thin, non-pure side of
 * `./cost`. Models listed at runtime (`listModels`) carry no prices here; their cost is unknown.
 */
import type { ModelPricing } from '@pku-harness/sdk';

import { registry } from '@/core/runtime/registry';

/** Published prices of a provider's model, if its plugin declares them. */
export function pricingOf(providerId: string, model: string): ModelPricing | undefined {
  return registry.provider(providerId)?.def.models.find((m) => m.id === model)?.pricing;
}
