/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { advance, nextStep, parseProgress, prevStep, resumePhase, retreat, startSetup, stepPosition, suggestionsFor, type OnboardingProgress } from './flow';

describe('step order', () => {
  test('next / prev walk ai → campus → plugins → done', () => {
    expect(nextStep('ai')).toBe('campus');
    expect(nextStep('campus')).toBe('plugins');
    expect(nextStep('plugins')).toBe('done');
    expect(nextStep('done')).toBe('done');
    expect(prevStep('ai')).toBeNull();
    expect(prevStep('done')).toBe('plugins');
  });

  test('progress position covers the three task steps only', () => {
    expect(stepPosition('ai')).toEqual({ index: 1, total: 3 });
    expect(stepPosition('plugins')).toEqual({ index: 3, total: 3 });
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
    for (const s of ['ai', 'campus', 'plugins'] as const) p = advance(p, s, 'skipped');
    expect(p.step).toBe('done');
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
