/**
 * The tool input rows the approval prompt shows (pure, unit-tested). Opaque handles the agent
 * passes around (session, snapshot and element ids) mean nothing to a person, so they are hidden;
 * long values are cut.
 */
const OPAQUE = /^(id|ref|.+Id)$/;
const MAX_ROWS = 6;
const MAX_CHARS = 80;

export function approvalFields(input: unknown): [string, string][] {
  if (!input || typeof input !== 'object') return [];
  return Object.entries(input as Record<string, unknown>)
    .filter(([k, v]) => !OPAQUE.test(k) && v !== undefined)
    .slice(0, MAX_ROWS)
    .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
    .map(([k, v]) => [k, v.length > MAX_CHARS ? `${v.slice(0, MAX_CHARS)}…` : v]);
}
