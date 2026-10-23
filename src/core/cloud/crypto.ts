import type { RandomBytes } from '@pku-harness/cloud-protocol';
import * as ExpoCrypto from 'expo-crypto';

/**
 * Randomness for every cloud key, nonce and proof of work: the OS CSPRNG through expo-crypto
 * (docs/CLOUD.md §3.2). Passed explicitly as `rand` to `@pku-harness/cloud-protocol`, so the
 * protocol never depends on a global `crypto` existing on Hermes.
 */
export const rand: RandomBytes = (n) => {
  const out = new Uint8Array(n);
  // getRandomValues takes at most 1,024 bytes per call (expo-crypto docs).
  for (let i = 0; i < n; i += 1024) out.set(ExpoCrypto.getRandomValues(new Uint8Array(Math.min(1024, n - i))), i);
  return out;
};
