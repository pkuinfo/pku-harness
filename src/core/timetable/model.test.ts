/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { occurrencesAfter } from '@/core/scheduler/recurrence';

import { classesOn, classStatus, courseReminderTrigger, formatWeeks, parseWeeks, weekOf, type Course, type Semester } from './model';

const sem: Semester = { name: '测试', start: '2026-09-07', weeks: 16 }; // Monday
const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  name: '高等数学',
  location: '理教 107',
  teacher: null,
  weekday: 3,
  start: '10:10',
  end: '12:00',
  weeks: null,
  color: 0,
  source: 'manual',
  ...over,
});
const fmt = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('weeks', () => {
  test('parse ranges, odd/even and lists', () => {
    expect(parseWeeks('1-4')).toEqual([1, 2, 3, 4]);
    expect(parseWeeks('1-7单周')).toEqual([1, 3, 5, 7]);
    expect(parseWeeks('2-8双')).toEqual([2, 4, 6, 8]);
    expect(parseWeeks('1，3, 5-6')).toEqual([1, 3, 5, 6]);
    expect(parseWeeks('单周', 6)).toEqual([1, 3, 5]);
    expect(parseWeeks('全部')).toBeNull();
    expect(() => parseWeeks('第一周')).toThrow();
  });
  test('format', () => {
    expect(formatWeeks(null)).toBe('每周');
    expect(formatWeeks([1, 2, 3])).toBe('1-3周');
    expect(formatWeeks([2, 4, 6])).toBe('2-6双周');
    expect(formatWeeks([1, 4, 9])).toBe('1,4,9周');
  });
});

describe('classesOn', () => {
  test('weekday, weeks and semester bounds', () => {
    const wed = new Date(2026, 9, 14); // week 6
    expect(weekOf(sem, wed)).toBe(6);
    expect(classesOn([course()], wed, sem)).toHaveLength(1);
    expect(classesOn([course({ weeks: [1, 3, 5] })], wed, sem)).toHaveLength(0);
    expect(classesOn([course()], new Date(2027, 0, 20), sem)).toHaveLength(0); // after week 16
    expect(classesOn([course()], wed, null)).toHaveLength(1);
  });
  test('sorted by start', () => {
    const list = classesOn([course({ id: 'b', start: '13:00' }), course({ id: 'a', start: '08:00' })], new Date(2026, 9, 14), sem);
    expect(list.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('classStatus', () => {
  test('before, ongoing, after', () => {
    const c = course();
    expect(classStatus(c, new Date(2026, 9, 14, 9, 40))).toMatchObject({ state: 'before', minutesToStart: 30 });
    const mid = classStatus(c, new Date(2026, 9, 14, 11, 5));
    expect(mid.state).toBe('ongoing');
    expect(mid.progress).toBeCloseTo(0.5, 2);
    expect(classStatus(c, new Date(2026, 9, 14, 12, 0)).state).toBe('after');
  });
});

describe('courseReminderTrigger', () => {
  test('every teaching week, 15 minutes before', () => {
    const t = courseReminderTrigger(course(), 15, sem);
    const all = occurrencesAfter(t, 0, 100);
    expect(all).toHaveLength(16);
    expect(fmt(all[0].at)).toBe('9-9 09:55');
    expect(fmt(all[15].at)).toBe('12-23 09:55');
  });
  test('odd weeks use a two-week interval', () => {
    const t = courseReminderTrigger(course({ weeks: parseWeeks('1-15单') }), 10, sem);
    const all = occurrencesAfter(t, 0, 100);
    expect(all.map((o) => fmt(o.at)).slice(0, 3)).toEqual(['9-9 10:00', '9-23 10:00', '10-7 10:00']);
    expect(all).toHaveLength(8);
  });
  test('even weeks start in week 2', () => {
    const all = occurrencesAfter(courseReminderTrigger(course({ weeks: parseWeeks('2-16双') }), 10, sem), 0, 100);
    expect(fmt(all[0].at)).toBe('9-16 10:00');
    expect(all).toHaveLength(8);
  });
  test('without a semester: weekly from now', () => {
    const now = new Date(2026, 9, 18, 12).getTime();
    const [first] = occurrencesAfter(courseReminderTrigger(course(), 15, null, now), now, 1);
    expect(fmt(first.at)).toBe('10-21 09:55');
  });
});
