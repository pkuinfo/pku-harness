/**
 * Marketplace search for the agent (`registry.marketplace(query)` in HostServices, used by
 * `plugins.search`). Searches the website's feed (pkuharness.com/marketplace.json:
 * official plugins plus community plugins indexed from other repositories), fetched at most once
 * an hour; when it is unreachable, the official registry the in-app marketplace loads (mirrored,
 * cached offline). Ranking is pure (`rankMarketplace`) so it is unit-tested.
 */
import { fetch as expoFetch } from 'expo/fetch';

import { type FeedPlugin } from './market-rank';
import { loadMarketplace } from './marketplace';

export { rankMarketplace } from './market-rank';

export const MARKETPLACE_FEED = 'https://pkuharness.com/marketplace.json';
const TTL_MS = 60 * 60_000;

let cache: { at: number; feed: FeedPlugin[] } | null = null;

/** The feed, from the website at most once an hour, else the official registry (mirrored, cached offline). */
export async function marketplaceFeed(now = Date.now()): Promise<FeedPlugin[]> {
  if (cache && now - cache.at < TTL_MS) return cache.feed;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await expoFetch(MARKETPLACE_FEED, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { plugins?: FeedPlugin[] };
      const feed = Array.isArray(data.plugins) ? data.plugins.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string') : [];
      cache = { at: now, feed };
      return feed;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    const { registry } = await loadMarketplace();
    return registry.plugins.map((p) => ({
      id: p.id, name: p.name, nameEn: p.i18n?.en.name, description: p.description, descriptionEn: p.i18n?.en.description,
      author: p.author, official: p.author === 'pkuinfo', verified: p.verified, tags: p.tags, kind: p.kind, source: p.source, endpoint: p.endpoint ?? undefined,
    }));
  }
}
