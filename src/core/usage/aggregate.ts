/**
 * Pure aggregation over usage rows for the usage screen (docs/AGENT-HARNESS.md §6.4). Local time
 * (the device's zone); weeks start on Monday. No React Native imports: unit-tested with bun.
 */
import { costOf, savedByCache, type Currency, type PriceLookup } from './cost';
import type { UsagePurpose, UsageStep } from './types';

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
  monthTurns: number;
};

export function summarize(rows: readonly UsageStep[], now: number): UsageKpis {
  const today = startOfDay(now);
  const month = startOfMonth(now);
  let todayTokens = 0;
  let monthTokens = 0;
  for (const r of rows) {
    if (r.at > now) continue;
    const t = tokensOf(r);
    if (r.at >= today) todayTokens += t;
    if (r.at >= month) monthTokens += t;
  }
  const monthTurns = turnRows(rows).filter((r) => r.at >= month && r.at <= now).length;
  return { todayTokens, monthTokens, monthTurns };
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

// ─── Prompt cache ────────────────────────────────────────────────────────────────────────────
//
// THE cache metric, used everywhere (usage board, context sheet): hit rate = Σ cached input ÷
// Σ input (prompt tokens incl. cached) over a set of requests. The headline number is over
// 'chat' requests only: they are the ones that share a stable prefix (system prompt + tools +
// history), so they are what prompt design can improve. Title/compaction requests use their own
// short prompts and are shown separately, never mixed into the headline.

export type HitTally = { requests: number; input: number; cached: number; /** cached ÷ input; null without input. */ rate: number | null };

const cachedOf = (r: UsageStep) => Math.max(0, Math.min(r.cachedInputTokens, r.inputTokens));

/** Hit rate over a set of requests. */
export function hitTally(rows: Iterable<UsageStep>): HitTally {
  let requests = 0;
  let input = 0;
  let cached = 0;
  for (const r of rows) {
    requests++;
    input += r.inputTokens;
    cached += cachedOf(r);
  }
  return { requests, input, cached, rate: input > 0 ? cached / input : null };
}

export type Money = { currency: Currency; amount: number };

/** Sums amounts per currency (never mixing them), largest first. */
class Purse {
  private map = new Map<Currency, number>();
  add(currency: Currency, amount: number) {
    this.map.set(currency, (this.map.get(currency) ?? 0) + amount);
  }
  list(): Money[] {
    return [...this.map].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
  }
}

export const CACHE_PURPOSES: readonly UsagePurpose[] = ['chat', 'title', 'compaction', 'scheduler'];

export type DayHit = HitTally & { date: number };

export type CacheStats = {
  /** The headline: chat requests, last 30 days. */
  chat: HitTally;
  /** Every purpose with requests in the last 30 days, in CACHE_PURPOSES order. */
  byPurpose: (HitTally & { purpose: UsagePurpose })[];
  /** Chat hit rate per day, last `days` days (oldest first, today last). */
  daily: DayHit[];
  /** Input tokens that missed the cache, all purposes, last 30 days. */
  missTokens: number;
  /** What the cache saved this calendar month (priced models only), per currency. */
  savedMonth: Money[];
};

/** Prompt-cache statistics for the usage board. */
export function cacheStats(rows: readonly UsageStep[], now: number, price: PriceLookup, days = 14): CacheStats {
  const today = startOfDay(now);
  const since30 = addDays(today, -29);
  const month = startOfMonth(now);
  const recent = rows.filter((r) => r.at >= since30 && r.at <= now);

  const byPurpose = CACHE_PURPOSES.map((purpose) => ({ purpose, ...hitTally(recent.filter((r) => r.purpose === purpose)) })).filter((p) => p.requests > 0);
  const all = hitTally(recent);

  const daily: DayHit[] = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i - (days - 1)), requests: 0, input: 0, cached: 0, rate: null }));
  const index = new Map(daily.map((d, i) => [dayKey(d.date), i]));
  const saved = new Purse();
  for (const r of rows) {
    if (r.at > now) continue;
    if (r.purpose === 'chat') {
      const i = index.get(dayKey(r.at));
      if (i !== undefined) {
        daily[i].requests++;
        daily[i].input += r.inputTokens;
        daily[i].cached += cachedOf(r);
      }
    }
    if (r.at >= month) {
      const p = price(r.providerId, r.model);
      if (p) saved.add(p.currency, savedByCache(r, p));
    }
  }
  for (const d of daily) d.rate = d.input > 0 ? d.cached / d.input : null;

  return {
    chat: hitTally(recent.filter((r) => r.purpose === 'chat')),
    byPurpose,
    daily,
    missTokens: all.input - all.cached,
    savedMonth: saved.list().filter((m) => m.amount > 0),
  };
}

export type SessionCache = { /** The session's latest chat request. */ last: number | null; session: HitTally };

/** Cache hit rate of one session's chat requests: the latest one and the whole session. */
export function sessionCache(rows: readonly UsageStep[], sessionId: string): SessionCache {
  const chat = rows.filter((r) => r.sessionId === sessionId && r.purpose === 'chat');
  let latest: UsageStep | undefined;
  for (const r of chat) if (!latest || r.at >= latest.at) latest = r;
  return { last: latest ? hitTally([latest]).rate : null, session: hitTally(chat) };
}

// ─── Spending ────────────────────────────────────────────────────────────────────────────────

export type ModelCost = { providerId: string; model: string; currency: Currency; amount: number; tokens: number; /** Of the total in the same currency. */ share: number };

export type Spending = {
  today: Money[];
  month: Money[];
  /** Priced models, last 30 days, most expensive first. */
  models: ModelCost[];
  /** Tokens of the last 30 days from models without published prices (not in any sum). */
  unpricedTokens: number;
  /** Any request in the window had a price. */
  priced: boolean;
};

/** Estimated spending from published prices; one sum per currency. */
export function spending(rows: readonly UsageStep[], now: number, price: PriceLookup): Spending {
  const today = startOfDay(now);
  const month = startOfMonth(now);
  const since30 = addDays(today, -29);
  const start = Math.min(month, since30);
  const day = new Purse();
  const mon = new Purse();
  const total30 = new Purse();
  const models = new Map<string, ModelCost>();
  let unpricedTokens = 0;
  let priced = false;
  for (const r of rows) {
    if (r.at < start || r.at > now) continue;
    const p = price(r.providerId, r.model);
    if (!p) {
      if (r.at >= since30) unpricedTokens += tokensOf(r);
      continue;
    }
    priced = true;
    const { total } = costOf(r, p);
    if (r.at >= today) day.add(p.currency, total);
    if (r.at >= month) mon.add(p.currency, total);
    if (r.at >= since30) {
      total30.add(p.currency, total);
      const k = `${r.providerId}\u0000${r.model}`;
      const m = models.get(k) ?? { providerId: r.providerId, model: r.model, currency: p.currency, amount: 0, tokens: 0, share: 0 };
      m.amount += total;
      m.tokens += tokensOf(r);
      models.set(k, m);
    }
  }
  const totals = new Map(total30.list().map((m) => [m.currency, m.amount]));
  return {
    today: day.list(),
    month: mon.list(),
    models: [...models.values()].map((m) => ({ ...m, share: (totals.get(m.currency) ?? 0) > 0 ? m.amount / totals.get(m.currency)! : 0 })).sort((a, b) => b.amount - a.amount),
    unpricedTokens,
    priced,
  };
}

/** Everything the usage screen draws, from one pass of rows. */
export type UsageReport = {
  kpis: UsageKpis;
  cache: CacheStats;
  spend: Spending;
  heat: Heatmap;
  hours: number[];
  days: DayTokens[];
  models: ModelStat[];
  empty: boolean;
};

export function buildReport(rows: readonly UsageStep[], now: number, price: PriceLookup = () => undefined): UsageReport {
  return {
    kpis: summarize(rows, now),
    cache: cacheStats(rows, now, price),
    spend: spending(rows, now, price),
    heat: heatmap(rows, now),
    hours: hourly(rows, now),
    days: dailyTokens(rows, now),
    models: modelShare(rows, now),
    empty: rows.length === 0,
  };
}

/** How far back the screen's main query reaches (20 weeks of heat map + a margin). */
export const REPORT_WINDOW_MS = 22 * 7 * DAY;
