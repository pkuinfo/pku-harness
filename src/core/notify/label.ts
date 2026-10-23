/**
 * Notification bodies that repeat their title as a label ("Fact" / "Fact: …"), which happens
 * when an agent's answer or a template starts with the job's name. The title already says it.
 */

/** A leading "Label:" / "标签：" (≤ 40 chars, one line) and the text after it. */
const LEADING_LABEL = /^\s*([^\n:：]{1,40}?)\s*[:：]\s*/u;

/** Case-, width- and punctuation-insensitive form used to compare labels. */
const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '');

/**
 * Drop leading labels from `body` that repeat `title` or the label right before them
 * ("Fact: Fact: x" → "x" under title "Fact"; "Tip: Tip: x" → "Tip: x" otherwise). Never
 * returns an empty body for a non-empty one.
 */
export function stripRepeatedLabel(title: string, body: string): string;
export function stripRepeatedLabel(title: string, body: string | undefined): string | undefined;
export function stripRepeatedLabel(title: string, body: string | undefined): string | undefined {
  if (!body) return body;
  const t = norm(title);
  /** Drop leading labels equal to `want` while text remains after them. */
  const drop = (text: string, want: string) => {
    for (;;) {
      const m = LEADING_LABEL.exec(text);
      const next = m && norm(m[1]!) === want ? text.slice(m[0].length) : '';
      if (!next.trim()) return text;
      text = next;
    }
  };
  if (t) {
    const rest = drop(body, t);
    if (rest !== body) return rest;
  }
  // A label that is not the title but repeats ("Tip: Tip: x") keeps one copy.
  const first = LEADING_LABEL.exec(body);
  const label = first && norm(first[1]!);
  if (!first || !label) return body;
  return first[0] + drop(body.slice(first[0].length), label);
}
