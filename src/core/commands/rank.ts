/**
 * Fuzzy ranking for the `/` menu (docs/AGENT-HARNESS.md §3), ported from DeepSeek Harness
 * packages/client/ui-primitives/src/rank-by-name.ts: the query must be a case-insensitive
 * ordered subsequence of the command's name or one of its aliases. Prefix hits rank first, then
 * the strongest alignment score over any key, then source order. Pure; see rank.test.ts.
 */

/** Extra weight for key starts and separator boundaries (`-`, `_`, `:`). */
function boundaryBonus(chars: readonly string[], index: number): number {
  if (index === 0) return 8;
  const prev = chars[index - 1];
  return prev === '-' || prev === '_' || prev === ':' ? 8 : 0;
}

/**
 * Score the strongest ordered-subsequence alignment in O(key × query). Boundary and adjacent
 * matches earn weight; skipped and leading characters cost weight. Undefined when the query is
 * not a subsequence of the key.
 */
export function alignmentScore(key: string, query: string): number | undefined {
  // Iterate code points so CJK aliases (and astral chars) compare as whole characters.
  const k = Array.from(key);
  const q = Array.from(query);
  if (q.length === 0) return 0;
  if (q.length > k.length) return undefined;
  const none = Number.NEGATIVE_INFINITY;
  const bonusAt = (i: number) => boundaryBonus(k, i);
  let previous = k.map((ch, i) => (ch === q[0] ? 1 + bonusAt(i) - i : none));
  for (let qi = 1; qi < q.length; qi++) {
    const current = Array<number>(k.length).fill(none);
    // `left` = previous row one char back (adjacent continuation); `leftLeft` two back (gapped).
    let left = none;
    let leftLeft = none;
    let bestGapped = none;
    for (let i = 0; i < k.length; i++) {
      if (leftLeft !== none) bestGapped = Math.max(bestGapped, leftLeft + i - 2);
      if (k[i] === q[qi]) {
        const bonus = 1 + bonusAt(i);
        let score = none;
        if (left !== none) score = left + bonus + 4;
        if (bestGapped !== none) score = Math.max(score, bestGapped + bonus + 1 - i);
        current[i] = score;
      }
      leftLeft = left;
      left = previous[i];
    }
    previous = current;
  }
  const best = Math.max(...previous);
  return best === none ? undefined : best;
}

/**
 * Rank items by a menu query over their name and aliases. Empty query returns the input list
 * unchanged (the menu groups it). No match → empty array (the menu hides).
 */
export function rankCommands<T extends { readonly name: string; readonly aliases: readonly string[] }>(
  items: readonly T[],
  rawQuery: string,
): T[] {
  const query = rawQuery.toLowerCase();
  if (query === '') return [...items];
  const ranked: { item: T; index: number; prefix: boolean; score: number }[] = [];
  items.forEach((item, index) => {
    let prefix = false;
    let score: number | undefined;
    for (const key of [item.name, ...item.aliases]) {
      const lower = key.toLowerCase();
      const s = alignmentScore(lower, query);
      if (s === undefined) continue;
      // A plugin-prefixed name (`treehole:search`) also counts as a prefix hit on its bare part.
      prefix ||= lower.startsWith(query) || (lower.includes(':') && lower.slice(lower.indexOf(':') + 1).startsWith(query));
      score = score === undefined ? s : Math.max(score, s);
    }
    if (score !== undefined) ranked.push({ item, index, prefix, score });
  });
  ranked.sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.score - a.score || a.index - b.index);
  return ranked.map((r) => r.item);
}
