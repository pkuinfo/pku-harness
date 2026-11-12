/** Marketplace ranking for the agent's plugin search (pure; see market-search.ts). */
import type { MarketplaceHit } from '@pku-harness/sdk';

export type FeedPlugin = {
  id: string;
  slug?: string;
  name: string;
  nameEn?: string;
  description?: string;
  descriptionEn?: string;
  author?: string;
  official?: boolean;
  verified?: boolean;
  tags?: string[];
  kind?: string;
  source?: string;
  installUrl?: string;
  endpoint?: string;
  tools?: unknown;
};

/** Feed plugins matching `query`, best first: id/name hits count most, then description and tags. */
export function rankMarketplace(feed: FeedPlugin[], query: string, installed: Set<string>, locale: 'en' | 'zh-Hans'): MarketplaceHit[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = feed.map((p) => {
    const title = `${p.id} ${p.name} ${p.nameEn ?? ''}`.toLowerCase();
    const body = `${p.description ?? ''} ${p.descriptionEn ?? ''} ${(p.tags ?? []).join(' ')}`.toLowerCase();
    let n = title.includes(q) || body.includes(q) ? 3 : 0;
    for (const w of words) n += title.includes(w) ? 2 : body.includes(w) ? 1 : 0;
    return { p, n };
  });
  return scored
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || Number(!!b.p.official) - Number(!!a.p.official))
    .map(({ p }) => ({
      id: p.id,
      name: (locale === 'en' ? p.nameEn : undefined) ?? p.name,
      description: ((locale === 'en' ? p.descriptionEn : undefined) ?? p.description ?? '').slice(0, 200),
      author: p.author ?? '',
      official: !!p.official,
      verified: !!p.verified,
      installed: installed.has(p.id),
      link: p.kind === 'remote' ? null : (p.installUrl ?? p.source ?? null),
      endpoint: p.kind === 'remote' ? (p.endpoint ?? null) : null,
    }));
}
