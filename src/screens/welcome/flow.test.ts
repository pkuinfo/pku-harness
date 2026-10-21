/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { advance, nextStep, parseProgress, permissionsOutcome, prevStep, remindersSummary, resumePhase, retreat, startSetup, stepPosition, suggestionsFor, type OnboardingProgress } from './flow';

describe('step order', () => {
  test('next / prev walk ai → campus → plugins → permissions → done', () => {
    expect(nextStep('ai')).toBe('campus');
    expect(nextStep('campus')).toBe('plugins');
    expect(nextStep('plugins')).toBe('permissions');
    expect(nextStep('permissions')).toBe('done');
    expect(nextStep('done')).toBe('done');
    expect(prevStep('ai')).toBeNull();
    expect(prevStep('permissions')).toBe('plugins');
    expect(prevStep('done')).toBe('permissions');
  });

  test('progress position covers the four task steps only', () => {
    expect(stepPosition('ai')).toEqual({ index: 1, total: 4 });
    expect(stepPosition('plugins')).toEqual({ index: 3, total: 4 });
    expect(stepPosition('permissions')).toEqual({ index: 4, total: 4 });
    expect(stepPosition('done')).toBeNull();
  });
});

describe('progress and resume', () => {
  test('a fresh install starts with the intro', () => {
    expect(resumePhase(undefined)).toEqual({ kind: 'intro' });
    expect(resumePhase(null)).toEqual({ kind: 'intro' });
  });

  test('after consent, a kill resumes on the saved step', () => {
    let p = startSetup(1000);
    expect(resumePhase(p)).toEqual({ kind: 'setup', step: 'ai' });
    p = advance(p, 'ai', 'done');
    p = advance(p, 'campus', 'skipped');
    // Round-trip through storage (JSON), as the kv store does.
    const stored = JSON.parse(JSON.stringify(p));
    expect(resumePhase(stored)).toEqual({ kind: 'setup', step: 'plugins' });
    expect(parseProgress(stored)?.outcomes).toEqual({ ai: 'done', campus: 'skipped' });
  });

  test('skipping every step still reaches the finish screen', () => {
    let p: OnboardingProgress = startSetup(0);
    for (const s of ['ai', 'campus', 'plugins', 'permissions'] as const) p = advance(p, s, 'skipped');
    expect(p.step).toBe('done');
    expect(p.outcomes.permissions).toBe('skipped');
  });

  test('progress saved before the permissions step existed still resumes', () => {
    // An older build saved after the plugins step: the step was then the finish screen.
    const old = { v: 1, step: 'done', consentAt: 5, outcomes: { ai: 'done', campus: 'skipped', plugins: 'done' } };
    expect(resumePhase(old)).toEqual({ kind: 'setup', step: 'done' });
    expect(parseProgress(old)?.outcomes).toEqual({ ai: 'done', campus: 'skipped', plugins: 'done' });
    const mid = { v: 1, step: 'plugins', consentAt: 5, outcomes: { ai: 'done' } };
    const p = parseProgress(mid);
    expect(p && advance(p, 'plugins', 'done').step).toBe('permissions');
  });

  test('a permissions outcome round-trips through storage', () => {
    const p = advance({ ...startSetup(0), step: 'permissions' }, 'permissions', 'done');
    expect(parseProgress(JSON.parse(JSON.stringify(p)))?.outcomes).toEqual({ permissions: 'done' });
  });

  test('going back keeps outcomes and moves the resume point', () => {
    const p = advance(startSetup(0), 'ai', 'done');
    const back = retreat(p, 'campus');
    expect(back.step).toBe('ai');
    expect(back.outcomes.ai).toBe('done');
    expect(retreat(back, 'ai').step).toBe('ai');
  });

  test('corrupt or foreign values fall back to the intro', () => {
    expect(parseProgress({ v: 2, step: 'ai', consentAt: 1 })).toBeNull();
    expect(parseProgress({ v: 1, step: 'nope', consentAt: 1 })).toBeNull();
    expect(parseProgress({ v: 1, step: 'ai' })).toBeNull();
    expect(parseProgress('ai')).toBeNull();
    expect(parseProgress({ v: 1, step: 'campus', consentAt: 1, outcomes: { ai: 'weird', zzz: 'done', plugins: 'done' } })?.outcomes).toEqual({ plugins: 'done' });
  });
});

describe('permissions step', () => {
  const ready = { notifications: 'granted', exactAlarms: true, batteryOptimized: true } as const;
  test('done only with notifications and exact alarms; battery is optional', () => {
    expect(permissionsOutcome(ready)).toBe('done');
    expect(permissionsOutcome({ ...ready, batteryOptimized: false })).toBe('done');
    expect(permissionsOutcome({ ...ready, exactAlarms: false })).toBe('skipped');
    expect(permissionsOutcome({ ...ready, notifications: 'undetermined' })).toBe('skipped');
    expect(permissionsOutcome({ ...ready, notifications: 'denied' })).toBe('skipped');
  });
  test('summary: on time, may be late without exact alarms, off without notifications', () => {
    expect(remindersSummary(ready)).toBe('onTime');
    expect(remindersSummary({ ...ready, exactAlarms: false })).toBe('mayBeLate');
    expect(remindersSummary({ ...ready, notifications: 'denied', exactAlarms: false })).toBe('off');
  });
});

describe('suggestions', () => {
  const all = new Set(['campus-card', 'course-sync', 'netfee', 'courses']);
  test('none without an AI service', () => {
    expect(suggestionsFor({ ai: false, campus: true, enabled: all })).toEqual([]);
  });
  test('campus questions first when signed in', () => {
    const s = suggestionsFor({ ai: true, campus: true, enabled: all });
    expect(s[0]).toBe('welcome.done.suggest.balance');
    expect(s).toHaveLength(3);
  });
  test('general questions when not signed in', () => {
    const s = suggestionsFor({ ai: true, campus: false, enabled: all });
    expect(s).toHaveLength(3);
    expect(s).not.toContain('welcome.done.suggest.balance');
  });
  test('respects disabled plugins', () => {
    const s = suggestionsFor({ ai: true, campus: true, enabled: new Set(['netfee']) });
    expect(s[0]).toBe('welcome.done.suggest.netFee');
    expect(s).toHaveLength(3);
  });
});
