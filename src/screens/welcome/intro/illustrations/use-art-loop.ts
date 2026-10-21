import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Whether an illustration may animate: its page is active, motion isn't reduced, and it hasn't
 * used up its budget. Loops end by themselves (an idle screen draws no frames, docs/DESIGN.md);
 * becoming active again starts a new budget.
 */
export function useArtLoop(active: boolean, budgetMs = 12_000) {
  const reduced = useReducedMotion();
  const [expired, setExpired] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  // Re-activation resets the budget (state adjusted during render, not in an effect).
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setExpired(false);
  }
  useEffect(() => {
    if (!active || reduced || expired) return;
    const t = setTimeout(() => setExpired(true), budgetMs);
    return () => clearTimeout(t);
  }, [active, reduced, expired, budgetMs]);
  return active && !reduced && !expired;
}
