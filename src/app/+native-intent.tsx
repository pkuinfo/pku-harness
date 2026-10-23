import { parkShareLink } from '@/core/cloud/incoming';

/**
 * Rewrite incoming deep links (Expo Router native intent). Plugin install links
 * (`pkuharness://plugin?src=<link>`, docs/PLUGIN-LANGUAGE.md §10) open the add sheet, which
 * fetches and shows the plugin before anything is installed. Share links
 * (`pkuharness://share/<id>#k=…`) carry their key in the fragment: park it in memory and route
 * with an opaque handle, so the key never sits in a route URL. Must never throw.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const install = /^pkuharness:\/\/plugin\/?\?(?:.*&)?src=([^&#]+)/i.exec(path);
    if (install) return `/plugins/add?link=${encodeURIComponent(decodeURIComponent(install[1]!))}`;
    const parked = /^pkuharness:\/\/share\//i.test(path) ? parkShareLink(path) : undefined;
    if (parked) return `/share/${parked.channelId}?h=${parked.handle}`;
    return path;
  } catch {
    return path;
  }
}
