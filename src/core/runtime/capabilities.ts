import type { Capability } from './types';

/**
 * Capabilities that come and go at runtime (docs/CLOUD.md §2.4): `'cloud'` is present while a
 * cloud provider is configured. The registry merges these with the device's fixed ones and
 * re-emits when they change, so plugins that `require` them update everywhere.
 */

const dynamic = new Set<Capability>();
const listeners = new Set<() => void>();

export function setDynamicCapability(c: Capability, present: boolean) {
  if (dynamic.has(c) === present) return;
  if (present) dynamic.add(c);
  else dynamic.delete(c);
  listeners.forEach((l) => l());
}

export function hasDynamicCapability(c: Capability): boolean {
  return dynamic.has(c);
}

export function subscribeCapabilities(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
