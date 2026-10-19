import { Lexer, type Token } from 'marked';
import remend from 'remend';

const OPTIONS = { gfm: true, breaks: true } as const;

/** GFM block tokens for a finished text. */
export const lexMarkdown = (text: string): Token[] => Lexer.lex(text, OPTIONS);

/**
 * Incremental lexer for a reply that only grows. Re-lexing the whole reply on every streamed
 * chunk is O(n) per chunk (quadratic over a reply) and dominated the JS thread on Hermes. A block
 * is final once another block follows it: later text can only extend or reinterpret the block it
 * lands in (a paragraph turning into a setext heading, a list gaining items). So settled blocks
 * are kept and only the text from the last block on is lexed again, with `remend` closing
 * unterminated syntax there. The finished reply is lexed whole once (`lexMarkdown`), which also
 * restores anything only a full pass sees (reference-style link definitions).
 */
export function streamLexer() {
  let settledText = '';
  let settled: Token[] = [];
  return (text: string): Token[] => {
    if (!text.startsWith(settledText)) {
      settledText = '';
      settled = [];
    }
    const tail = Lexer.lex(remend(text.slice(settledText.length)), OPTIONS);
    let last = tail.length - 1;
    while (last > 0 && tail[last].type === 'space') last--;
    if (last > 0) {
      const done = tail.slice(0, last);
      const raw = done.map((t) => t.raw).join('');
      // Only commit text that is really the source (remend edits the end, never settled blocks).
      if (text.startsWith(raw, settledText.length)) {
        settledText += raw;
        settled = settled.concat(done);
        return settled.concat(tail.slice(last));
      }
    }
    return settled.concat(tail);
  };
}
