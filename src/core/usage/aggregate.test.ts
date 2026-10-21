/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { dailyTokens, heatmap, hourly, modelShare, pluginRanking, summarize, toolRanking, turnRows } from './aggregate';
import type { UsageStep } from './types';

// Tuesday 2026-10-20 21:40 local.
const NOW = new Date(2026, 9, 20, 21, 40).getTime();
const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h).getTime();

function row(p: Partial<UsageStep> & { at: number }): UsageStep {
  return {
    sessionId: 's1',
    providerId: 'deepseek.api',
    model: 'deepseek-chat',
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 100,
    reasoningTokens: 0,
    durationMs: 1000,
    tools: [],
    purpose: 'chat',
    ...p,
  };
}

describe('turnRows', () => {
  test('counts distinct turn ids, else final steps', () => {
    const rows = [
      row({ at: at(10, 20, 9), turnId: 'a', tools: [{ toolId: 'x.y', pluginId: 'x', ok: true }] }),
      row({ at: at(10, 20, 9), turnId: 'a' }),
      row({ at: at(10, 20, 10), tools: [{ toolId: 'x.y', pluginId: 'x', ok: true }] }),
      row({ at: at(10, 20, 10) }),
      row({ at: at(10, 20, 11), purpose: 'title' }),
    ];
    expect(turnRows(rows)).toHaveLength(2);
  });
});

describe('summarize', () => {
  test('today, month, cache rate and turns', () => {
    const rows = [
      row({ at: at(10, 20, 8), inputTokens: 2000, cachedInputTokens: 1500, outputTokens: 200 }),
      row({ at: at(10, 2), inputTokens: 1000, cachedInputTokens: 500, outputTokens: 100 }),
      row({ at: at(9, 25), inputTokens: 1000, cachedInputTokens: 0, outputTokens: 0 }),
      row({ at: at(8, 1), inputTokens: 5000, cachedInputTokens: 5000, outputTokens: 0 }), // > 30 days
    ];
    const k = summarize(rows, NOW);
    expect(k.todayTokens).toBe(2200);
    expect(k.monthTokens).toBe(3300);
    expect(k.cacheHitRate).toBeCloseTo(2000 / 4000);
    expect(k.monthTurns).toBe(2);
  });
  test('no input → null cache rate', () => {
    expect(summarize([], NOW).cacheHitRate).toBeNull();
  });
});

describe('heatmap', () => {
  test('20 Monday-first weeks ending with today, future cells null', () => {
    const h = heatmap([row({ at: at(10, 19) }), row({ at: at(10, 19, 15) }), row({ at: at(10, 20) })], NOW);
    expect(h.weeks).toHaveLength(20);
    const last = h.weeks[19];
    // Monday 10-19 and Tuesday 10-20 exist; Wednesday on is null.
    expect(new Date(last[0]!.date).getDate()).toBe(19);
    expect(last[0]!.turns).toBe(2);
    expect(last[0]!.tokens).toBe(2200);
    expect(last[0]!.level).toBe(4);
    expect(last[1]!.turns).toBe(1);
    expect(last[1]!.level).toBe(2);
    expect(last[2]).toBeNull();
    expect(last[6]).toBeNull();
    expect(h.maxTurns).toBe(2);
    expect(h.totalTurns).toBe(3);
    expect(h.weeks[0].every((c) => c && c.level === 0)).toBe(true);
    expect(new Date(h.weeks[0][0]!.date).getDay()).toBe(1);
  });
  test('month labels on columns where the month changes', () => {
    const h = heatmap([], NOW);
    const labels = h.months.map((m) => m.label);
    expect(labels.at(-1)).toBe('10月');
    expect(h.months.every((m, i) => i === 0 || m.col > h.months[i - 1].col)).toBe(true);
  });
});

describe('hourly', () => {
  test('turns per hour, last 30 days only', () => {
    const hrs = hourly([row({ at: at(10, 20, 21) }), row({ at: at(10, 18, 21) }), row({ at: at(10, 19, 8) }), row({ at: at(8, 1, 21) })], NOW);
    expect(hrs).toHaveLength(24);
    expect(hrs[21]).toBe(2);
    expect(hrs[8]).toBe(1);
  });
});

describe('dailyTokens', () => {
  test('14 days split cached / uncached / output, today last', () => {
    const d = dailyTokens([row({ at: at(10, 20), inputTokens: 1000, cachedInputTokens: 800, outputTokens: 50 }), row({ at: at(10, 7), purpose: 'compaction' }), row({ at: at(10, 6) })], NOW);
    expect(d).toHaveLength(14);
    expect(d[13]).toMatchObject({ cached: 800, uncached: 200, output: 50 });
    expect(new Date(d[0].date).getDate()).toBe(7);
    expect(d[0].uncached).toBe(1000);
  });
});

describe('toolRanking', () => {
  const rows = [
    row({ at: at(10, 20), tools: [{ toolId: 'card.balance', pluginId: 'card', ok: true }, { toolId: 'card.balance', pluginId: 'card', ok: false }] }),
    row({ at: at(10, 1), tools: [{ toolId: 'tt.today', pluginId: 'tt', ok: true }] }),
    row({ at: at(5, 1), tools: [{ toolId: 'tt.today', pluginId: 'tt', ok: true }, { toolId: 'tt.today', pluginId: 'tt', ok: true }] }),
  ];
  test('ranges', () => {
    expect(toolRanking(rows, NOW, '7d').map((t) => t.toolId)).toEqual(['card.balance']);
    expect(toolRanking(rows, NOW, '30d').map((t) => t.toolId)).toEqual(['card.balance', 'tt.today']);
    const all = toolRanking(rows, NOW, 'all');
    expect(all[0]).toMatchObject({ toolId: 'tt.today', calls: 3, successRate: 1 });
    expect(all[1]).toMatchObject({ toolId: 'card.balance', calls: 2, successRate: 0.5 });
  });
  test('plugin roll-up', () => {
    expect(pluginRanking(toolRanking(rows, NOW, 'all'))).toEqual([
      { pluginId: 'tt', calls: 3, ok: 3, successRate: 1 },
      { pluginId: 'card', calls: 2, ok: 1, successRate: 0.5 },
    ]);
  });
});

describe('modelShare', () => {
  test('shares sum to 1, sorted', () => {
    const m = modelShare([row({ at: at(10, 20), model: 'pro', inputTokens: 3000, outputTokens: 0 }), row({ at: at(10, 19), inputTokens: 1000, outputTokens: 0 })], NOW);
    expect(m.map((x) => x.model)).toEqual(['pro', 'deepseek-chat']);
    expect(m[0].share).toBeCloseTo(0.75);
  });
});
