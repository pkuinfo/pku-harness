import { eclipse } from './eclipse';
import { orb } from './orb';
import { silk } from './silk';
import type { HeroVariantName, HeroVariantSpec } from './types';

export type { HeroVariantName, HeroVariantSpec, OrbitSpec } from './types';

export const heroVariants: Record<HeroVariantName, HeroVariantSpec> = { orb, eclipse, silk };

/** The shipped hero. */
export const DEFAULT_HERO: HeroVariantName = 'orb';

/** `?hero=<name>` (dev preview) → a known variant, else the default. */
export function parseHeroVariant(value: unknown): HeroVariantName {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && Object.hasOwn(heroVariants, v) ? (v as HeroVariantName) : DEFAULT_HERO;
}
