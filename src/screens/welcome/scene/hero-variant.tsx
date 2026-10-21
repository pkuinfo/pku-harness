import { createContext, useContext, type ReactNode } from 'react';

import { DEFAULT_HERO, type HeroVariantName } from './variants';

const HeroVariantContext = createContext<HeroVariantName>(DEFAULT_HERO);

/** Which hero variant the welcome flow shows (dev preview: `pkuharness://welcome?hero=<name>`). */
export function HeroVariantProvider({ value, children }: { value: HeroVariantName; children: ReactNode }) {
  return <HeroVariantContext.Provider value={value}>{children}</HeroVariantContext.Provider>;
}

export const useHeroVariant = () => useContext(HeroVariantContext);
