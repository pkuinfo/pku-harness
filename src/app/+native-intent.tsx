import { parkShareLink } from '@/core/cloud/incoming';

/**
 * Rewrite incoming deep links (Expo Router native intent). Share links
 * (`pkuharness://share/<id>#k=…`) carry their key in the fragment: park it in memory and route
 * with an opaque handle, so the key never sits in a route URL. Must never throw.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const parked = /^pkuharness:\/\/share\//i.test(path) ? parkShareLink(path) : undefined;
    if (parked) return `/share/${parked.channelId}?h=${parked.handle}`;
    return path;
  } catch {
    return path;
  }
}
