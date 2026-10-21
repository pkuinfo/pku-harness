/**
 * Pure aggregation over usage rows for the usage screen (docs/AGENT-HARNESS.md §6.4). Local time
 * (the device's zone); weeks start on Monday. No React Native imports: unit-tested with bun.
 */
import type { UsageStep } from './types';

const DAY = 86_400_000;

export const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** Calendar-safe day arithmetic (survives DST shifts where they exist). */
export const addDays = (ms: number, n: number) => {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
const startOfMonth = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
export const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
/** 0 = Monday … 6 = Sunday. */
const weekday = (ms: number) => (new Date(ms).getDay() + 6) % 7;

export const tokensOf = (r: UsageStep) => r.inputTokens + r.outputTokens;

/**
 * Rows that start a chat turn. With `turnId`, the first row of each id; rows without one count
 * when they are a turn's last step (no tool calls), since the steps before it called tools.
 */
export function turnRows(rows: readonly UsageStep[]): UsageStep[] {
  const seen = new Set<string>();
  const out: UsageStep[] = [];
  for (const r of rows) {
    if (r.purpose !== 'chat') continue;
    if (r.turnId) {
      if (seen.has(r.turnId)) continue;
      seen.add(r.turnId);
      out.push(r);
    } else if (r.tools.length === 0) out.push(r);
  }
  return out;
}

export type UsageKpis = {
  todayTokens: number;
  monthTokens: number;
  /** cached ÷ input over the last 30 days; null without any input yet. */
  cacheHitRate: number | null;
  monthTurns: number;
};

export function summarize(rows: readonly UsageStep[], now: number): UsageKpis {
  const today = startOfDay(now);
  const month = startOfMonth(now);
  const since30 = addDays(today, -29);
  let todayTokens = 0;
  let monthTokens = 0;
  let input = 0;
  let cached = 0;
  for (const r of rows) {
    if (r.at > now) continue;
    const t = tokensOf(r);
    if (r.at >= today) todayTokens += t;
    if (r.at >= month) monthTokens += t;
    if (r.at >= since30) {
      input += r.inputTokens;
      cached += Math.min(r.cachedInputTokens, r.inputTokens);
    }
  }
  const monthTurns = turnRows(rows).filter((r) => r.at >= month && r.at <= now).length;
  return { todayTokens, monthTokens, cacheHitRate: input > 0 ? cached / input : null, monthTurns };
}

export type HeatCell = { date: number; turns: number; tokens: number; level: 0 | 1 | 2 | 3 | 4 };
export type Heatmap = {
  /** Columns (weeks, oldest first) of 7 cells, Monday first; null = after today. */
  weeks: (HeatCell | null)[][];
  maxTurns: number;
  /** Month labels by column ("10月"), skipping a first label that would crowd the next. */
  months: { col: number; label: string }[];
  totalTurns: number;
};

/** GitHub-style activity: chat turns per day for the last `weeks` weeks, ending with today's week. */
export function heatmap(rows: readonly UsageStep[], now: number, weeks = 20): Heatmap {
  const today = startOfDay(now);
  const first = addDays(today, -weekday(today) - (weeks - 1) * 7);
  const byDay = new Map<string, { turns: number; tokens: number }>();
  const bump = (at: number, turns: number, tokens: number) => {
    const k = dayKey(at);
    const e = byDay.get(k) ?? { turns: 0, tokens: 0 };
    e.turns += turns;
    e.tokens += tokens;
    byDay.set(k, e);
  };
  for (const r of rows) if (r.at >= first && r.at <= now) bump(r.at, 0, tokensOf(r));
  for (const r of turnRows(rows)) if (r.at >= first && r.at <= now) bump(r.at, 1, 0);

  let maxTurns = 0;
  let totalTurns = 0;
  for (const e of byDay.values()) {
    maxTurns = Math.max(maxTurns, e.turns);
    totalTurns += e.turns;
  }
  const level = (turns: number): HeatCell['level'] => (turns <= 0 || maxTurns <= 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((turns / maxTurns) * 4))) as HeatCell['level']));

  const cols: (HeatCell | null)[][] = [];
  const months: Heatmap['months'] = [];
  let prevMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(first, w * 7);
    const col: (HeatCell | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d);
      if (date > today) {
        col.push(null);
        continue;
      }
      const e = byDay.get(dayKey(date));
      col.push({ date, turns: e?.turns ?? 0, tokens: e?.tokens ?? 0, level: level(e?.turns ?? 0) });
    }
    cols.push(col);
    const m = new Date(monday).getMonth();
    if (m !== prevMonth) months.push({ col: w, label: `${m + 1}月` });
    prevMonth = m;
  }
  // The first column's label collides with a month change right after it: drop it.
  if (months.length > 1 && months[0].col === 0 && months[1].col < 3) months.shift();
  return { weeks: cols, maxTurns, months, totalTurns };
}

/** Chat turns per hour of day (0–23) over the last `days` days. */
export function hourly(rows: readonly UsageStep[], now: number, days = 30): number[] {
  const since = addDays(startOfDay(now), -(days - 1));
  const out = Array.from({ length: 24 }, () => 0);
  for (const r of turnRows(rows)) if (r.at >= since && r.at <= now) out[new Date(r.at).getHours()]++;
  return out;
}

export type DayTokens = { date: number; cached: number; uncached: number; output: number };

/** Tokens per day for the last `days` days (oldest first, today last), all request purposes. */
export function dailyTokens(rows: readonly UsageStep[], now: number, days = 14): DayTokens[] {
  const today = startOfDay(now);
  const out: DayTokens[] = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i - (days - 1)), cached: 0, uncached: 0, output: 0 }));
  const index = new Map(out.map((d, i) => [dayKey(d.date), i]));
  for (const r of rows) {
    if (r.at > now) continue;
    const i = index.get(dayKey(r.at));
    if (i === undefined) continue;
    const cached = Math.min(r.cachedInputTokens, r.inputTokens);
    out[i].cached += cached;
    out[i].uncached += r.inputTokens - cached;
    out[i].output += r.outputTokens;
  }
  return out;
}

export type ToolRange = '7d' | '30d' | 'all';
export type ToolStat = { toolId: string; pluginId: string; calls: number; ok: number; successRate: number };

/** Tool calls ranked by count, with success rate. */
export function toolRanking(rows: readonly UsageStep[], now: number, range: ToolRange): ToolStat[] {
  const since = range === 'all' ? -Infinity : addDays(startOfDay(now), range === '7d' ? -6 : -29);
  const map = new Map<string, ToolStat>();
  for (const r of rows) {
    if (r.at < since || r.at > now) continue;
    for (const t of r.tools) {
      const s = map.get(t.toolId) ?? { toolId: t.toolId, pluginId: t.pluginId, calls: 0, ok: 0, successRate: 0 };
      s.calls++;
      if (t.ok) s.ok++;
      map.set(t.toolId, s);
    }
  }
  return [...map.values()]
    .map((s) => ({ ...s, successRate: s.calls ? s.ok / s.calls : 0 }))
    .sort((a, b) => b.calls - a.calls || a.toolId.localeCompare(b.toolId));
}

export type PluginStat = { pluginId: string; calls: number; ok: number; successRate: number };

/** Tool stats rolled up per plugin. */
export function pluginRanking(tools: readonly ToolStat[]): PluginStat[] {
  const map = new Map<string, PluginStat>();
  for (const t of tools) {
    const s = map.get(t.pluginId) ?? { pluginId: t.pluginId, calls: 0, ok: 0, successRate: 0 };
    s.calls += t.calls;
    s.ok += t.ok;
    map.set(t.pluginId, s);
  }
  return [...map.values()].map((s) => ({ ...s, successRate: s.calls ? s.ok / s.calls : 0 })).sort((a, b) => b.calls - a.calls);
}

export type ModelStat = { providerId: string; model: string; tokens: number; share: number };

/** Share of tokens per model over the last `days` days. */
export function modelShare(rows: readonly UsageStep[], now: number, days = 30): ModelStat[] {
  const since = addDays(startOfDay(now), -(days - 1));
  const map = new Map<string, ModelStat>();
  let total = 0;
  for (const r of rows) {
    if (r.at < since || r.at > now) continue;
    const t = tokensOf(r);
    total += t;
    const k = `${r.providerId}\u0000${r.model}`;
    const s = map.get(k) ?? { providerId: r.providerId, model: r.model, tokens: 0, share: 0 };
    s.tokens += t;
    map.set(k, s);
  }
  return [...map.values()]
    .filter((s) => s.tokens > 0)
    .map((s) => ({ ...s, share: total ? s.tokens / total : 0 }))
    .sort((a, b) => b.tokens - a.tokens);
}

/** Everything the usage screen draws, from one pass of rows. */
export type UsageReport = {
  kpis: UsageKpis;
  heat: Heatmap;
  hours: number[];
  days: DayTokens[];
  models: ModelStat[];
  empty: boolean;
};

export function buildReport(rows: readonly UsageStep[], now: number): UsageReport {
  return {
    kpis: summarize(rows, now),
    heat: heatmap(rows, now),
    hours: hourly(rows, now),
    days: dailyTokens(rows, now),
    models: modelShare(rows, now),
    empty: rows.length === 0,
  };
}

/** How far back the screen's main query reaches (20 weeks of heat map + a margin). */
export const REPORT_WINDOW_MS = 22 * 7 * DAY;
