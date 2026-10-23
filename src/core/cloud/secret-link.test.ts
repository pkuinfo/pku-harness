/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { createSecretLink, isSecretLink, revealLink, scrubOutput, scrubShareLinks } from './secret-link';

const KEY = 'A'.repeat(43);
const URL = `https://s.example.org/s/abcdefgh12345678#k=${KEY}`;

describe('SecretLink', () => {
  test('never serialises its URL', () => {
    const link = createSecretLink(URL, 'abcdefgh12345678');
    expect(JSON.stringify(link)).toBe('"[secret link]"');
    expect(JSON.stringify({ link })).toBe('{"link":"[secret link]"}');
    expect(String(link)).toBe('[secret link]');
    expect(`${link}`).toBe('[secret link]');
    expect(Object.values(link).join(' ')).not.toContain('#k=');
    expect(link.kind).toBe('secret-link');
    expect(link.channelId).toBe('abcdefgh12345678');
  });

  test('only the host can reveal it; forgeries are rejected', () => {
    const link = createSecretLink(URL, 'abcdefgh12345678');
    expect(revealLink(link)).toBe(URL);
    expect(isSecretLink(link)).toBe(true);
    const forged = { kind: 'secret-link' as const, channelId: 'x', toJSON: () => URL };
    expect(isSecretLink(forged)).toBe(false);
    expect(() => revealLink(forged)).toThrow();
  });

  test('is immutable', () => {
    const link = createSecretLink(URL, 'abcdefgh12345678');
    expect(() => {
      (link as { channelId: string }).channelId = 'other';
    }).toThrow();
  });
});

describe('scrubOutput', () => {
  test('redacts links in nested strings and SecretLink objects', () => {
    const link = createSecretLink(URL, 'abcdefgh12345678');
    const out = scrubOutput({ ok: true, text: `open ${URL} now`, nested: [{ link }, `pkuharness://share/abcdefgh12345678#k=${KEY}`], n: 3 });
    expect(out as unknown).toEqual({ ok: true, text: 'open https://s.example.org[secret link] now', nested: [{ link: '[secret link]' }, 'pkuharness[secret link]'], n: 3 });
    expect(JSON.stringify(out)).not.toContain(KEY);
  });

  test('keeps SecretLink objects for screens when asked', () => {
    const link = createSecretLink(URL, 'abcdefgh12345678');
    const out = scrubOutput({ link }, { keepLinks: true });
    expect(out.link).toBe(link);
  });

  test('copies only what changes and leaves other objects alone', () => {
    const date = new Date(0);
    const input = { a: { b: 'plain' }, date, list: [1, 2] };
    const out = scrubOutput(input);
    expect(out).toBe(input);
    const withLink = { keep: input.a, bad: `x/s/abcdefgh12345678#k=${KEY}` };
    const scrubbed = scrubOutput(withLink);
    expect(scrubbed).not.toBe(withLink);
    expect(scrubbed.keep).toBe(input.a);
    expect(withLink.bad).toContain(KEY); // input untouched
  });

  test('handles cycles', () => {
    const a: Record<string, unknown> = { s: 'x' };
    a.self = a;
    expect(() => scrubOutput(a)).not.toThrow();
  });

  test('strips a bare key fragment (viewer page after the /s/ redirect)', () => {
    expect(scrubShareLinks(`https://s.example.org/w/card-share/view#k=${KEY}`)).toBe('https://s.example.org/w/card-share/view#k=[redacted]');
  });
});
