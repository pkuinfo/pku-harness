/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { welcome as en } from '@/i18n/messages/en/welcome';
import { welcome as zh } from '@/i18n/messages/zh-Hans/welcome';

import { PAGES } from './intro/copy';

type Tree = { [k: string]: string | Tree };

/** Every leaf as [dotted key, string]. */
function leaves(t: Tree, prefix = ''): [string, string][] {
  return Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));
}

const zhLeaves = new Map(leaves(zh as Tree));
const enLeaves = leaves(en as Tree);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('welcome copy', () => {
  test('English has exactly the Chinese keys', () => {
    expect(enLeaves.map(([k]) => k).sort()).toEqual([...zhLeaves.keys()].sort());
  });

  test('English uses the same placeholders', () => {
    for (const [k, v] of enLeaves) expect([k, placeholders(v)]).toEqual([k, placeholders(zhLeaves.get(k) ?? '')]);
  });

  test('English follows the copy rules: no CJK, curly apostrophes, no exclamation marks', () => {
    for (const [k, v] of enLeaves) {
      expect([k, /[　-〿㐀-鿿＀-￯]/.test(v)]).toEqual([k, false]);
      expect([k, v.includes("'")]).toEqual([k, false]);
      expect([k, v.includes('!')]).toEqual([k, false]);
    }
  });

  test('every intro page has copy, and English titles keep the Chinese line breaks at display width', () => {
    for (const p of PAGES) {
      const zhTitle = zh.intro[p].title;
      const enTitle = en.intro[p].title;
      expect(enTitle.split('\n')).toHaveLength(zhTitle.split('\n').length);
      // Display type is 40 px: about 15 characters fit a line on a 360 dp phone.
      for (const line of enTitle.split('\n')) expect([p, line, line.length <= 15]).toEqual([p, line, true]);
    }
  });
});
