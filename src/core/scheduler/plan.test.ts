/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { diffArmed, IOS_LIMITS, MAX_ARMED, planNotifications } from './plan';
import type { Job } from '@pku-harness/sdk';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const now = at(2026, 10, 18, 10);

const job = (over: Partial<Job>): Job => ({
  id: 'j1',
  title: '喝水',
  trigger: { type: 'every', unit: 'day', interval: 3, times: ['08:00'], startAt: at(2026, 10, 19), count: 16 },
  action: { type: 'notify', title: '喝水', body: '起来走走' },
  enabled: true,
  source: 'agent',
  runs: 0,
  lastRunAt: null,
  nextRunAt: null,
  createdAt: now,
  updatedAt: 1,
  ...over,
});

describe('planNotifications', () => {
  test('arms upcoming occurrences inside the horizon with progress text', () => {
    const plan = planNotifications([job({})], now);
    // 14-day horizon, every 3 days from 10-19: 19, 22, 25, 28, 31.
    expect(plan).toHaveLength(5);
    expect(plan[0]).toMatchObject({ identifier: 'job:j1:1:0', at: at(2026, 10, 19, 8), body: '起来走走 · 第 1/16 次' });
  });

  test('progress text follows the label the engine passes (app language)', () => {
    const [first] = planNotifications([job({ action: { type: 'notify', title: 'Water', body: 'Stand up' } })], now, (n, total) => `${n} of ${total}`);
    expect(first.body).toBe('Stand up · 1 of 16');
  });

  test('skips disabled, finished and check jobs', () => {
    expect(planNotifications([job({ enabled: false })], now)).toEqual([]);
    expect(planNotifications([job({ trigger: { type: 'at', at: now - 1 } })], now)).toEqual([]);
    expect(
      planNotifications(
        [job({ action: { type: 'check', tool: 'x.y', condition: { path: '', op: 'always' }, title: 't' } })],
        now,
      ),
    ).toEqual([]);
  });

  test('one-shot has no progress suffix', () => {
    const [n] = planNotifications([job({ trigger: { type: 'at', at: now + 60_000 }, action: { type: 'notify', title: '开会' } })], now);
    expect(n.body).toBeUndefined();
  });

  test('caps the total and keeps the soonest', () => {
    const minutely = (id: string) =>
      job({ id, trigger: { type: 'every', unit: 'minute', interval: 1, startAt: now + 60_000 } });
    const plan = planNotifications(Array.from({ length: 10 }, (_, i) => minutely(`m${i}`)), now);
    expect(plan).toHaveLength(MAX_ARMED);
    expect(plan.every((p, i) => i === 0 || p.at >= plan[i - 1].at)).toBe(true);
  });

  test('editing a job changes its identifiers so it re-arms', () => {
    const a = planNotifications([job({ updatedAt: 1 })], now)[0].identifier;
    const b = planNotifications([job({ updatedAt: 2 })], now)[0].identifier;
    expect(a).not.toBe(b);
  });
});

describe('iOS limits (64 pending per app)', () => {
  test('never more than the iOS cap, and a dense series cannot crowd out the others', () => {
    const dense = job({ id: 'dense', trigger: { type: 'every', unit: 'hour', interval: 1, startAt: now } });
    const daily = job({ id: 'daily', trigger: { type: 'every', unit: 'day', interval: 1, times: ['21:00'], startAt: now } });
    const plan = planNotifications([dense, daily], now, undefined, IOS_LIMITS);
    expect(plan.length).toBeLessThanOrEqual(IOS_LIMITS.maxArmed);
    // The hourly job alone would fill the cap within a day; the daily one still gets its next runs.
    expect(plan.filter((p) => p.jobId === 'daily').length).toBeGreaterThan(0);
    expect(plan.filter((p) => p.jobId === 'dense').length).toBeLessThanOrEqual(IOS_LIMITS.perJob);
  });
});

describe('diffArmed', () => {
  test('cancels stale ids, schedules missing, ignores foreign notifications', () => {
    const desired = planNotifications([job({})], now);
    const scheduled = ['job:j1:1:0', 'job:old:1:3', 'test-notification'];
    const d = diffArmed(desired, scheduled);
    expect(d.cancel).toEqual(['job:old:1:3']);
    expect(d.schedule.map((s) => s.identifier)).toEqual(desired.slice(1).map((s) => s.identifier));
  });
});
