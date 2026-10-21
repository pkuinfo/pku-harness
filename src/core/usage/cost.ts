/**
 * Estimated money cost of model requests from a model's published prices (`ProviderModel.pricing`).
 * Pure: no registry or React Native imports (the lookup lives in `./pricing`). Unit-tested with bun.
 *
 * Token accounting (AI SDK + @ai-sdk/openai-compatible, checked 2026-10-20):
 * - `inputTokens` is the whole prompt (`prompt_tokens`), cache hits included; the miss part is
 *   `inputTokens − cachedInputTokens`.
 * - `outputTokens` is `completion_tokens`, which already includes reasoning tokens
 *   (`reasoningTokens` is a subset), so reasoning is never billed twice.
 */
import type { ModelPricing } from '@pku-harness/sdk';

import type { UsageStep } from './types';

export type Currency = ModelPricing['currency'];
export type StepCost = { hit: number; miss: number; output: number; total: number; currency: Currency };

const PER = 1_000_000;

/** Whether `at` falls inside one of the pricing's peak windows (in the provider's time zone). */
export function isPeak(at: number, pricing: ModelPricing): boolean {
  const p = pricing.peak;
  if (!p || !p.hours.length) return false;
  const local = new Date(at + p.utcOffsetMinutes * 60_000);
  if (!p.weekdays.includes(local.getUTCDay())) return false;
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  return p.hours.some(([start, end]) => hour >= start && hour < end);
}

/** Price multiplier at `at`: the peak multiplier inside a peak window, else 1. */
export function priceFactor(at: number, pricing: ModelPricing): number {
  return isPeak(at, pricing) ? (pricing.peak?.multiplier ?? 1) : 1;
}

/** Cached input tokens of a step, clamped to its input. */
const cachedOf = (s: Pick<UsageStep, 'inputTokens' | 'cachedInputTokens'>) => Math.max(0, Math.min(s.cachedInputTokens, s.inputTokens));

/** Estimated cost of one request. */
export function costOf(step: Pick<UsageStep, 'at' | 'inputTokens' | 'cachedInputTokens' | 'outputTokens'>, pricing: ModelPricing): StepCost {
  const f = priceFactor(step.at, pricing);
  const cached = cachedOf(step);
  const hit = (cached * pricing.inputCacheHit * f) / PER;
  const miss = (Math.max(0, step.inputTokens - cached) * pricing.inputCacheMiss * f) / PER;
  const output = (Math.max(0, step.outputTokens) * pricing.output * f) / PER;
  return { hit, miss, output, total: hit + miss + output, currency: pricing.currency };
}

/** What the cache saved on one request: cached tokens billed at the hit price instead of the miss price. */
export function savedByCache(step: Pick<UsageStep, 'at' | 'inputTokens' | 'cachedInputTokens'>, pricing: ModelPricing): number {
  const f = priceFactor(step.at, pricing);
  return (cachedOf(step) * Math.max(0, pricing.inputCacheMiss - pricing.inputCacheHit) * f) / PER;
}

/** How many times cheaper a cache hit is than a miss ("1/50"), or null when it can't be said. */
export function hitDiscount(pricing: ModelPricing): number | null {
  if (!(pricing.inputCacheHit > 0) || !(pricing.inputCacheMiss > pricing.inputCacheHit)) return null;
  return Math.round(pricing.inputCacheMiss / pricing.inputCacheHit);
}

/** Looks up a model's prices (provider id + model id); undefined = unknown. */
export type PriceLookup = (providerId: string, model: string) => ModelPricing | undefined;
