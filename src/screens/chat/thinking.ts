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

/**
 * Height (dp) of the live window showing `lines` lines of `lineHeight` text at the system font
 * scale. Text lineHeight follows the font scale (RN `allowFontScaling`), so a fixed height would
 * clip lines at large scales and leave a gap at small ones. Each line is rounded up because
 * Android lays out whole pixels per line.
 */
export function thinkingWindowHeight(lineHeight: number, fontScale: number, lines: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return Math.ceil(lineHeight * scale) * lines;
}

/** Whole seconds thought, at least 1 (a block that streamed at all took some time). */
export function thinkingSeconds(ms: number): number {
  return Math.max(1, Math.round(ms / 1000));
}
