import { expect, test } from 'bun:test';
import { stepBudget } from './step-budget';

test('long-running plugins extend only runs that actually use them', () => {
  const budgets = new Map([['phone__tap', 40], ['lookup__read', 10]]);
  expect(stepBudget([], budgets)).toBe(10);
  expect(stepBudget(['lookup__read'], budgets)).toBe(10);
  expect(stepBudget(['phone__tap'], budgets)).toBe(40);
  expect(stepBudget(['unknown'], budgets)).toBe(10);
});

test('plugin metadata cannot remove the host bounds', () => {
  expect(stepBudget(['a'], new Map([['a', 100000]]))).toBe(60);
  for (const invalid of [NaN, Infinity, -5, 0]) expect(stepBudget(['a'], new Map([['a', invalid]]))).toBe(10);
  expect(stepBudget(['a'], new Map([['a', 15.9]]))).toBe(15);
});
