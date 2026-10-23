import { describe, expect, test } from 'bun:test';

import { stripRepeatedLabel } from './label';

describe('stripRepeatedLabel', () => {
  test('drops a label that repeats the title', () => {
    expect(stripRepeatedLabel('Fact', 'Fact: Octopuses have three hearts.')).toBe('Octopuses have three hearts.');
  });

  test('drops the label repeated several times', () => {
    expect(stripRepeatedLabel('Fact', 'Fact: Fact: Honey never spoils.')).toBe('Honey never spoils.');
  });

  test('is case- and punctuation-insensitive', () => {
    expect(stripRepeatedLabel('Fun fact!', 'fun-fact :  Bananas are berries.')).toBe('Bananas are berries.');
    expect(stripRepeatedLabel('Daily Fact', 'DAILY FACT: x')).toBe('x');
  });

  test('handles the full-width Chinese colon', () => {
    expect(stripRepeatedLabel('冷知识', '冷知识：章鱼有三颗心脏。')).toBe('章鱼有三颗心脏。');
    expect(stripRepeatedLabel('【冷知识】', '冷知识： 冷知识：蜂蜜不会变质')).toBe('蜂蜜不会变质');
  });

  test('collapses a repeated label that is not the title', () => {
    expect(stripRepeatedLabel('Morning', 'Fact: Fact: Honey never spoils.')).toBe('Fact: Honey never spoils.');
  });

  test('leaves other bodies alone', () => {
    expect(stripRepeatedLabel('Fact', 'Balance: ¥42.10')).toBe('Balance: ¥42.10');
    expect(stripRepeatedLabel('Fact', 'Facts are stubborn: so it goes')).toBe('Facts are stubborn: so it goes');
    expect(stripRepeatedLabel('Fact', 'No label here')).toBe('No label here');
    expect(stripRepeatedLabel('Fact', undefined)).toBeUndefined();
    expect(stripRepeatedLabel('Fact', '')).toBe('');
  });

  test('never empties the body', () => {
    expect(stripRepeatedLabel('Fact', 'Fact:')).toBe('Fact:');
    expect(stripRepeatedLabel('Fact', 'Fact: Fact:')).toBe('Fact:');
  });
});
