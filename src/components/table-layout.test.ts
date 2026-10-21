import { describe, expect, test } from 'bun:test';

import { layoutColumns, numericColumn, textUnits } from './table-layout';

describe('textUnits', () => {
  test('CJK and full-width count double', () => {
    expect(textUnits('Net')).toBe(3);
    expect(textUnits('物理学院')).toBe(8);
    expect(textUnits('¥16,892')).toBe(7);
  });
});

describe('numericColumn', () => {
  test('money, counts and percentages are numeric; words are not', () => {
    expect(numericColumn(['¥3,000', '¥14,000', '¥17,000'])).toBe(true);
    expect(numericColumn(['1', '2', '3'])).toBe(true);
    expect(numericColumn(['82%', '95%'])).toBe(true);
    expect(numericColumn(['2026-09', '2026-10', 'Total'])).toBe(false);
    expect(numericColumn(['物理学院', '学工办'])).toBe(false);
    expect(numericColumn([])).toBe(false);
    // A bolded total row is still a number.
    expect(numericColumn(['1', '2', '**3**'])).toBe(true);
  });
});

describe('layoutColumns', () => {
  const income = [
    ['Month', 'Items', 'Gross', 'Tax', 'Net'],
    ['2026-09', '1', '¥3,000', '0', '¥3,000'],
    ['2026-10', '2', '¥14,000', '¥108', '¥13,892'],
    ['Total', '3', '¥17,000', '¥108', '¥16,892'],
  ];
  test('a five-column money table fits a phone bubble and fills it (no scrolling)', () => {
    const { widths, scroll } = layoutColumns(income, 324);
    expect(scroll).toBe(false);
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(324);
    expect(widths.reduce((a, b) => a + b, 0)).toBeGreaterThan(314);
  });
  test('a wide table scrolls with natural widths, capped per column', () => {
    const wide = [Array.from({ length: 9 }, (_, i) => `很长的列标题 ${i}`)];
    const { widths, scroll } = layoutColumns(wide, 330);
    expect(scroll).toBe(true);
    expect(Math.max(...widths)).toBeLessThanOrEqual(240);
  });
  test('measured widths win over estimates', () => {
    const { widths } = layoutColumns([['a', 'b']], 0, { measured: [100, 30] });
    expect(widths).toEqual([118, 48]);
  });
  test('ragged rows get the full column count', () => {
    expect(layoutColumns([['a', 'b', 'c'], ['d']], 300).widths).toHaveLength(3);
  });
});
