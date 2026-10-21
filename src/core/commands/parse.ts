/**
 * Pure command-line parsing (docs/AGENT-HARNESS.md §3). No React, no stores: unit-tested in
 * parse.test.ts. Mirrors DeepSeek Harness `parseCommand` (packages/interaction/commands) and
 * its alias resolution (packages/client/ui-commands/src/client/resolution.ts).
 */
import type { Command } from './types';

/** Valid bare command names (built-ins and plugin contributions). */
export const COMMAND_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Split a draft into the `/token` its first line starts with and the rest (trimmed). The token
 * runs to the first whitespace; null when the draft does not start with `/` + a token.
 */
export function splitCommandLine(draft: string): { token: string; input: string } | null {
  const text = draft.trimStart();
  const match = /^\/([^\s/][^\s]*)(?=\s|$)/u.exec(text);
  if (!match) return null;
  return { token: match[1].toLowerCase(), input: text.slice(match[0].length).trim() };
}

/** Resolve a typed token: exact name first (all commands), then aliases in list order. */
export function resolveCommand(token: string, commands: readonly Command[]): Command | undefined {
  const t = token.toLowerCase();
  return commands.find((c) => c.name === t) ?? commands.find((c) => c.aliases.some((a) => a.toLowerCase() === t));
}

/** The command a draft starts with plus its input, or null (unknown `/xyz` stays plain text). */
export function parseCommandLine(draft: string, commands: readonly Command[]): { command: Command; input: string } | null {
  const split = splitCommandLine(draft);
  if (!split) return null;
  const command = resolveCommand(split.token, commands);
  return command ? { command, input: split.input } : null;
}

/**
 * The menu query while the draft is a leading `/` token still being typed (no whitespace yet),
 * e.g. '/co' → 'co', '/' → ''. null once a space or newline follows the token, or for anything
 * else. The composer has no caret position for us, so "cursor in the token" = "draft is only
 * the token".
 */
export function menuQuery(draft: string): string | null {
  const match = /^\/(\S*)$/u.exec(draft.trimStart());
  if (!match) return null;
  // A second slash means a path or URL (`/a/b`, `//`), not a command.
  if (match[1].includes('/')) return null;
  return match[1];
}

/**
 * How the input joins the text before `{{input}}`: nothing after a space, opening quote or
 * bracket ("搜索「{{input}}」"), a space after sentence punctuation, "：" after Chinese, ": "
 * after a Latin word ("study in{{input}}" + "二教" → "study in: 二教"). Without a joiner the
 * model got "study in nowScience Teaching Building".
 */
function joiner(before: string, input: string): string {
  const prev = before.at(-1) ?? '';
  if (!input || !prev || /[\s“"'‘「『（(【\[]/.test(prev) || /^[\s,，、:：;；.。!！?？)）」』]/.test(input)) return '';
  if (/[.!?]/.test(prev)) return ' ';
  if (/[。！？，；：]/.test(prev)) return '';
  if (/[\u3400-\u9fff]/.test(prev)) return '：';
  return ': ';
}

/** Expand a prompt template: `{{input}}` becomes the input; without a placeholder, input is appended. */
export function expandPrompt(template: string, input: string): string {
  const text = input.trim();
  if (template.includes('{{input}}')) {
    const parts = template.split('{{input}}');
    return parts.reduce((out, part, i) => (i === 0 ? part : `${out}${joiner(out, text)}${text}${part}`), '').trim();
  }
  return text ? `${template}\n\n${text}` : template;
}
