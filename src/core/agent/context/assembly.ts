/**
 * How the parts of a request are ordered and connected across turns (docs/AGENT-HARNESS.md §5.1).
 * A request hits the prefix cache up to its first changed token, so:
 *
 * - **Sort by stability.** Plugin instructions and tools go in tiers: core plugins (always on),
 *   then bundled ones the user can toggle, then remote/community plugins (installed and removed
 *   most often); by id within a tier. A change lands as late as possible and keeps the rest.
 * - **Snapshot only what changed.** Per-turn facts ride in the user message's `<context>` block.
 *   A fact already visible in the history (a memory, the reply language) is not repeated: each
 *   turn appends only lines the model hasn't seen since the last compaction. A fact that changed
 *   is retracted (`- [已删除] old`, `- [更正] old → new`) only where the history still shows it.
 *
 * Pure: no React Native imports, unit-tested.
 */
import type { ModelMessage } from 'ai';

import { CONTEXT_MARK } from '@pku-harness/sdk';

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

/** Each `<context>` block the model can still see (user messages since the last compaction), oldest first. */
export function visibleContextBlocks(history: readonly ModelMessage[]): string[] {
  const out: string[] = [];
  for (const m of history) {
    if (m.role !== 'user') continue;
    const text = typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
    const open = text.indexOf('<context>');
    const close = text.indexOf('</context>');
    if (open >= 0 && close > open) out.push(text.slice(open + 9, close));
  }
  return out;
}

/** The `<context>` blocks the model can still see, joined. */
export function visibleContext(history: readonly ModelMessage[]): string {
  return visibleContextBlocks(history).join('\n');
}

type FactLine = { kind: 'fact'; text: string } | { kind: 'deleted'; old: string } | { kind: 'corrected'; old: string; text: string };

/** A list line (`- …`) as a fact, a deletion or a correction; undefined for other lines. */
function parseFact(line: string): FactLine | undefined {
  const l = line.trim();
  if (!l.startsWith('- ')) return undefined;
  const body = l.slice(2).trim();
  if (body.startsWith(CONTEXT_MARK.deleted)) return { kind: 'deleted', old: body.slice(CONTEXT_MARK.deleted.length).trim() };
  if (body.startsWith(CONTEXT_MARK.corrected)) {
    const rest = body.slice(CONTEXT_MARK.corrected.length).trim();
    const at = rest.indexOf(CONTEXT_MARK.arrow.trim());
    if (at > 0) return { kind: 'corrected', old: rest.slice(0, at).trim(), text: rest.slice(at + 1).trim() };
  }
  return { kind: 'fact', text: body };
}

/** Apply a fact line to what the model currently believes. */
function apply(believed: Set<string>, f: FactLine) {
  if (f.kind === 'fact') believed.add(f.text);
  else {
    believed.delete(f.old);
    if (f.kind === 'corrected') believed.add(f.text);
  }
}

/** The facts the model currently believes from the visible context, in order (retractions applied). */
export function believedFacts(seen: string): Set<string> {
  const believed = new Set<string>();
  for (const line of seen.split('\n')) {
    const f = parseFact(line);
    if (f) apply(believed, f);
  }
  return believed;
}

/**
 * A plugin's context block minus what the model already knows. Retractions come first, in
 * order: one is kept only while the model still believes its old fact (so it lands once, and
 * never in a chat that didn't see the fact). Then facts the model doesn't believe yet are kept
 * (a correction already carries its new text). The block is dropped when nothing new is left;
 * other lines (a header) stay with the new items they introduce. A block without list items
 * repeats only when its text changed.
 */
export function newFacts(block: string, seen: string): string | undefined {
  const lines = block.split('\n');
  const facts = lines.map(parseFact);
  if (!facts.some(Boolean)) {
    const seenLines = new Set(seen.split('\n').map((l) => l.trim()));
    return seenLines.has(block.trim()) ? undefined : block;
  }
  const believed = believedFacts(seen);
  const keep = new Set<number>();
  facts.forEach((f, i) => {
    if (f && f.kind !== 'fact' && believed.has(f.old)) {
      keep.add(i);
      apply(believed, f);
    }
  });
  facts.forEach((f, i) => {
    if (f?.kind === 'fact' && !believed.has(f.text)) {
      keep.add(i);
      apply(believed, f);
    }
  });
  if (!keep.size) return undefined;
  return lines.filter((_, i) => !facts[i] || keep.has(i)).join('\n');
}

/** The reply-language snapshot line; appended only when it differs from the last one visible. */
export const LANGUAGE_PREFIX = '回复语言：';

export function languageLine(locale: 'en' | 'zh-Hans'): string {
  return locale === 'en'
    ? `${LANGUAGE_PREFIX}English（应用界面是英文；用户用其他语言写时跟随用户。校园名称如树洞、教学网保留原名，必要时加英文注释）`
    : `${LANGUAGE_PREFIX}中文（用户用其他语言写时跟随用户）`;
}

/**
 * `line` if the latest visible language snapshot says something else (or there is none). Only
 * the host's own line counts: in each block, the first line after the time line, and only when
 * it is exactly one of the host's language lines. Plugin facts (a memory, say) come after it and
 * can't forge or suppress a language switch.
 */
export function languageSnapshot(line: string, seenBlocks: readonly string[]): string | undefined {
  const host = new Set([languageLine('en'), languageLine('zh-Hans')]);
  let last: string | undefined;
  for (const block of seenBlocks) {
    const candidate = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)[1];
    if (candidate && host.has(candidate)) last = candidate;
  }
  return last === line ? undefined : line;
}

/**
 * The user's own message asks to remember something ("记住我在物理学院", "remember that…").
 * Used by the memory taint gate: a write the user asked for is their intent, even when the turn
 * also read third-party content (which can't write the user's message).
 */
export function asksToRemember(text: string): boolean {
  return /记住|记一下|记下来?|别忘了|不要忘|帮我记|\bremember\b|\bkeep in mind\b|\bnote that\b|\bdon['’]t forget\b/i.test(text);
}

