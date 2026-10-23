import { parseShareLink } from '@pku-harness/cloud-protocol';

/**
 * Share links opened into the app (`pkuharness://share/<id>#k=…`, docs/CLOUD.md §3.2). The key
 * stays out of route URLs: `+native-intent` parks the link here and routes with an opaque handle,
 * which the plugin screen host turns back into `params.link` for the viewer screen.
 */

const parked = new Map<string, string>();
let seq = 0;

/** Park a share link; returns undefined when `url` isn't one. */
export function parkShareLink(url: string): { handle: string; channelId: string } | undefined {
  const parsed = parseShareLink(url);
  if (!parsed) return undefined;
  const handle = `s${++seq}${Date.now().toString(36)}`;
  parked.set(handle, url.trim());
  // Keep only the latest few.
  if (parked.size > 8) parked.delete(parked.keys().next().value!);
  return { handle, channelId: parsed.channelId };
}

/** The parked link for a handle (still parked: the screen may re-mount). */
export function parkedShareLink(handle: string | undefined): string | undefined {
  return handle ? parked.get(handle) : undefined;
}
