import { expect, test } from 'bun:test';

import { LEGAL_VERSION } from './version';
import { renderLegal } from './render';

test('documents.generated.ts matches docs/legal (run bun scripts/legal.ts)', async () => {
  const current = await Bun.file(new URL('./documents.generated.ts', import.meta.url)).text();
  expect(current).toBe(await renderLegal());
});

test('LEGAL_VERSION is the effective date in every document', async () => {
  const [y, m, d] = LEGAL_VERSION.split('-').map(Number);
  for (const name of ['terms', 'privacy']) {
    expect(await Bun.file(new URL(`../../../docs/legal/${name}.zh.md`, import.meta.url)).text()).toContain(`${y} 年 ${m} 月 ${d} 日`);
    expect(await Bun.file(new URL(`../../../docs/legal/${name}.en.md`, import.meta.url)).text()).toContain(`Effective date: ${d} `);
  }
});
