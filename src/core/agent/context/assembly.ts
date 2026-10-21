/**
 * How the parts of a request are ordered and connected across turns (docs/AGENT-HARNESS.md §5.1).
 * A request hits the prefix cache up to its first changed token, so:
 *
 * - **Sort by stability.** Plugin instructions and tools go in tiers: core plugins (always on),
 *   then bundled ones the user can toggle, then remote/community plugins (installed and removed
 *   most often); by id within a tier. A change lands as late as possible and keeps the rest.
 * - **Snapshot only what changed.** Per-turn facts ride in the user message's `<context>` block.
 *   A fact already visible in the history (a memory, the reply language) is not repeated: each
 *   turn appends only lines the model hasn't seen since the last compaction.
 *
 * Pure: no React Native imports, unit-tested.
 */
import type { ModelMessage } from 'ai';

export type TieredPlugin = { id: string; core?: boolean; remote?: unknown };

/** 0 = core (can't be turned off), 1 = bundled, 2 = remote / community. */
export function stabilityTier(p: TieredPlugin): 0 | 1 | 2 {
  return p.remote ? 2 : p.core ? 0 : 1;
}

/** Most stable first, then by id: the order of plugin instructions and of the tool block. */
export function byStability(a: TieredPlugin, b: TieredPlugin): number {
  const t = stabilityTier(a) - stabilityTier(b);
  if (t) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The `<context>` blocks the model can still see (user messages since the last compaction). */
export function visibleContext(history: readonly ModelMessage[]): string {
  const out: string[] = [];
  for (const m of history) {
    if (m.role !== 'user') continue;
    const text = typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
    const open = text.indexOf('<context>');
    const close = text.indexOf('</context>');
    if (open >= 0 && close > open) out.push(text.slice(open + 9, close));
  }
  return out.join('\n');
}

/**
 * A plugin's context block minus the facts already visible: list lines (`- …`) the model has
 * seen are dropped, and the block is dropped when nothing new is left. Other lines (a header)
 * stay with the new items they introduce.
 */
export function newFacts(block: string, seen: string): string | undefined {
  const seenLines = new Set(seen.split('\n').map((l) => l.trim()));
  const lines = block.split('\n');
  const items = lines.filter((l) => l.trimStart().startsWith('- '));
  if (!items.length) return seenLines.has(block.trim()) ? undefined : block;
  const fresh = items.filter((l) => !seenLines.has(l.trim()));
  if (!fresh.length) return undefined;
  return lines.filter((l) => !l.trimStart().startsWith('- ') || fresh.includes(l)).join('\n');
}

/** The reply-language snapshot line; appended only when it differs from the last one visible. */
export const LANGUAGE_PREFIX = '回复语言：';

export function languageLine(locale: 'en' | 'zh-Hans'): string {
  return locale === 'en'
    ? `${LANGUAGE_PREFIX}English（应用界面是英文；用户用其他语言写时跟随用户。校园名称如树洞、教学网保留原名，必要时加英文注释）`
    : `${LANGUAGE_PREFIX}中文（用户用其他语言写时跟随用户）`;
}

/** `line` if the latest visible language snapshot says something else (or there is none). */
export function languageSnapshot(line: string, seen: string): string | undefined {
  const last = seen
    .split('\n')
    .filter((l) => l.startsWith(LANGUAGE_PREFIX))
    .at(-1);
  return last === line ? undefined : line;
}
