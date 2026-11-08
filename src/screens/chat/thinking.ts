/** Text helpers for the thinking pill (pure: unit-tested). */

/** Markdown emphasis the model sprinkles into its thinking; noise in a one-line preview. */
const EMPHASIS = /\*\*|__|`/g;

/** First non-empty line, without emphasis markers or a leading heading/list marker. */
export function thinkingPreview(text: string): string {
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  return line.replace(EMPHASIS, '').replace(/^\s*(?:#+|[-*]|\d+[.)])\s+/, '').trim();
}

/** The thinking as shown expanded: emphasis markers dropped, blank-line runs squeezed. */
export function thinkingBody(text: string): string {
  return text.replace(EMPHASIS, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * While streaming only the tail is rendered: the live window shows the last few lines, and
 * laying out thousands of characters on every delta would cost frames for nothing.
 */
export function thinkingTail(text: string, max = 480): string {
  if (text.length <= max) return text;
  const cut = text.slice(-max);
  const nl = cut.indexOf('\n');
  return nl >= 0 && nl < max / 2 ? cut.slice(nl + 1) : cut;
}

/** Whole seconds thought, at least 1 (a block that streamed at all took some time). */
export function thinkingSeconds(ms: number): number {
  return Math.max(1, Math.round(ms / 1000));
}
