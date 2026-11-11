import { describe, expect, test } from 'bun:test';

import { INLINE_CHARS, inlinePreview, searchText, sliceText } from './text';

describe('inlinePreview', () => {
  test('short text is returned whole', () => {
    expect(inlinePreview('hello')).toEqual({ head: 'hello', truncated: false });
    expect(INLINE_CHARS).toBe(8000);
  });

  test('cuts at a line boundary near max', () => {
    const text = `${'a'.repeat(70)}\n${'b'.repeat(50)}`;
    const out = inlinePreview(text, 100);
    expect(out).toEqual({ head: 'a'.repeat(70), truncated: true });
  });

  test('falls back to a sentence end', () => {
    const text = `${'字'.repeat(80)}。${'后'.repeat(40)}`;
    expect(inlinePreview(text, 100).head).toBe(`${'字'.repeat(80)}。`);
  });

  test('never splits a surrogate pair', () => {
    const text = 'x'.repeat(9) + '😀'.repeat(10);
    const out = inlinePreview(text, 10);
    expect(out.truncated).toBe(true);
    expect(out.head).toBe('x'.repeat(9));
    const out2 = inlinePreview('😀'.repeat(10), 5);
    expect(out2.head).toBe('😀😀');
  });
});

describe('sliceText', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');

  test('pages through text on line boundaries', () => {
    let offset: number | null = 0;
    let joined = '';
    let pages = 0;
    while (offset !== null) {
      const page = sliceText(lines, offset, 50);
      expect(page.offset).toBe(offset);
      if (page.next !== null) expect(page.text.endsWith('\n')).toBe(true);
      joined += page.text;
      offset = page.next;
      pages++;
    }
    expect(joined).toBe(lines);
    expect(pages).toBeGreaterThan(10);
  });

  test('clamps offset and length', () => {
    expect(sliceText('abc', 99)).toEqual({ offset: 3, text: '', next: null });
    expect(sliceText('abc', -5, 2)).toEqual({ offset: 0, text: 'ab', next: 2 });
    expect(sliceText('abc', 0, 0)).toEqual({ offset: 0, text: 'a', next: 1 });
    const big = 'x'.repeat(50000);
    const page = sliceText(big, 0, 999999);
    expect(page.text.length).toBe(20000);
    expect(page.next).toBe(20000);
  });

  test('does not split surrogate pairs', () => {
    const page = sliceText('😀😀😀', 0, 3);
    expect(page.text).toBe('😀');
    expect(page.next).toBe(2);
  });
});

describe('searchText', () => {
  const filler = (n: number) => 'lorem ipsum '.repeat(n);
  const text = `${filler(40)}Final Exam at 理教 101.\n${filler(40)}the final grade is posted${filler(5)}\n${filler(30)}exam room changed to 二教 ${filler(40)}`;

  test('case-insensitive phrase match with snippet markers', () => {
    const hits = searchText(text, 'FINAL exam');
    expect(hits.length).toBe(1);
    expect(text.slice(hits[0].offset, hits[0].offset + 10)).toBe('Final Exam');
    expect(hits[0].snippet.startsWith('…')).toBe(true);
    expect(hits[0].snippet.endsWith('…')).toBe(true);
    expect(hits[0].snippet).toContain('Final Exam at 理教 101.');
    expect(hits[0].snippet.length).toBeLessThanOrEqual(245);
  });

  test('multi-term match within a window', () => {
    const hits = searchText(text, 'exam 二教');
    expect(hits.length).toBe(1);
    expect(hits[0].snippet).toContain('exam room changed to 二教');
    expect(searchText(text, 'exam 二教', { window: 5 })).toEqual([]);
  });

  test('single term, max and ordering', () => {
    const hits = searchText(text, 'final');
    expect(hits.map((h) => text.slice(h.offset, h.offset + 5).toLowerCase())).toEqual(['final', 'final']);
    expect(hits[0].offset).toBeLessThan(hits[1].offset);
    expect(searchText(text, 'final', { max: 1 }).length).toBe(1);
  });

  test('empty query and no match', () => {
    expect(searchText(text, '   ')).toEqual([]);
    expect(searchText(text, 'zzz')).toEqual([]);
    expect(searchText('a.b', '.')).toHaveLength(1);
  });
});
