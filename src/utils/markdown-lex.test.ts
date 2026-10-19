/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import remend from 'remend';

import { lexMarkdown, streamLexer } from './markdown-lex';

const SAMPLES = [
  '# 校园卡\n\n余额 **¥86.50**，比昨天少了 `12.00` 元。\n\n- 食堂 A\n- 食堂 B\n  - 二楼\n\n1. 第一\n2. 第二\n\n> 引用一段\n> 第二行\n\n---\n\n结束。',
  '| 课程 | 地点 | 时间 |\n|---|:-:|--:|\n| 高数 | 理教 101 | 8:00 |\n| 线代 | 二教 203 | 10:10 |\n\n下面是代码：\n\n```ts\nconst a = 1;\n\nconst b = **2**;\n```\n\n完成。',
  'Setext 标题\n===\n\n段落一行\n第二行 [链接](https://example.com) 和 ~~删除~~。\n\n    缩进代码\n\n- [x] 已完成\n- [ ] 未完成\n\n- 松散列表\n\n- 第二项\n\n最后一段 *斜体* 结尾',
  '先说结论：可以。\n\n1. 打开看板\n2. 添加 **余额**\n   继续说明\n\n   第二段属于第二项\n3. 保存\n\n```\n未闭合的代码块\n',
];

/** Feed the text as a stream of small chunks, as the model does. */
function* chunks(text: string, size: number) {
  for (let i = size; i < text.length + size; i += size) yield text.slice(0, i);
}

describe('streamLexer', () => {
  for (const [n, sample] of SAMPLES.entries()) {
    for (const size of [1, 3, 17]) {
      test(`sample ${n}, chunk ${size}: matches a full lex at every step`, () => {
        const lex = streamLexer();
        for (const text of chunks(sample, size)) {
          const got = lex(text).map((t) => [t.type, t.raw]);
          const want = lexMarkdown(remend(text)).map((t) => [t.type, t.raw]);
          expect(got).toEqual(want);
        }
      });
    }
  }

  test('starts over when the text is replaced rather than extended', () => {
    const lex = streamLexer();
    lex('第一段\n\n第二段');
    expect(lex('全新的回复').map((t) => t.raw)).toEqual(['全新的回复']);
  });
});
