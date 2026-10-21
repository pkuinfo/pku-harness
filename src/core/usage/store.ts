/**
 * The `usage` table (migration 3, docs/AGENT-HARNESS.md §6.1): one row per model request.
 */
import { getDb } from '@/core/store/db';

import type { ToolCallUsage, UsagePurpose, UsageStep } from './types';

type Row = {
  at: number;
  session_id: string;
  provider_id: string;
  model: string;
  purpose: string;
  input: number;
  cached_input: number;
  output: number;
  reasoning: number;
  duration_ms: number;
  tools: string;
  turn_id: string | null;
};

const PURPOSES: readonly UsagePurpose[] = ['chat', 'compaction', 'title', 'scheduler'];
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

function parseTools(json: string): ToolCallUsage[] {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter((t): t is ToolCallUsage => !!t && typeof t === 'object' && typeof (t as ToolCallUsage).toolId === 'string');
  } catch {
    return [];
  }
}

function decode(r: Row): UsageStep {
  return {
    at: r.at,
    sessionId: r.session_id,
    providerId: r.provider_id,
    model: r.model,
    purpose: (PURPOSES as string[]).includes(r.purpose) ? (r.purpose as UsagePurpose) : 'chat',
    inputTokens: r.input,
    cachedInputTokens: r.cached_input,
    outputTokens: r.output,
    reasoningTokens: r.reasoning,
    durationMs: r.duration_ms,
    tools: parseTools(r.tools),
    turnId: r.turn_id ?? undefined,
  };
}

export async function insertStep(s: UsageStep): Promise<void> {
  const db = await getDb();
  const tools = (s.tools ?? []).map((t) => ({ toolId: String(t.toolId), pluginId: String(t.pluginId), ok: !!t.ok, ...(t.ms !== undefined ? { ms: n(t.ms) } : {}) }));
  await db.runAsync(
    `INSERT INTO usage (at, session_id, provider_id, model, purpose, input, cached_input, output, reasoning, duration_ms, tools, turn_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      n(s.at) || Date.now(),
      String(s.sessionId ?? ''),
      String(s.providerId ?? ''),
      String(s.model ?? ''),
      PURPOSES.includes(s.purpose) ? s.purpose : 'chat',
      n(s.inputTokens),
      Math.min(n(s.cachedInputTokens), n(s.inputTokens)),
      n(s.outputTokens),
      n(s.reasoningTokens),
      n(s.durationMs),
      JSON.stringify(tools),
      s.turnId ?? null,
    ],
  );
}

/** Rows since a time, oldest first. */
export async function loadRows(since: number): Promise<UsageStep[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM usage WHERE at >= ? ORDER BY at ASC', [since]);
  return rows.map(decode);
}

/** One session's 'chat' rows, oldest first (the context sheet's cache line). */
export async function loadSessionChatRows(sessionId: string): Promise<UsageStep[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM usage WHERE session_id = ? AND purpose = 'chat' ORDER BY at ASC`, [sessionId]);
  return rows.map(decode);
}

/** All-time rows that called tools (the "全部" tool ranking), oldest first. */
export async function loadToolRows(): Promise<UsageStep[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM usage WHERE tools != '[]' ORDER BY at ASC`);
  return rows.map(decode);
}

export type ChatReport = { inputTokens: number; outputTokens: number; at: number };

/** Latest 'chat' request per session (provider-reported prompt size). */
export async function loadLatestReports(): Promise<Map<string, ChatReport>> {
  const db = await getDb();
  // SQLite: bare columns in a MAX() aggregate come from the row holding the max.
  const rows = await db.getAllAsync<{ session_id: string; input: number; output: number; at: number }>(
    `SELECT session_id, input, output, MAX(at) AS at FROM usage WHERE purpose = 'chat' GROUP BY session_id`,
  );
  return new Map(rows.map((r) => [r.session_id, { inputTokens: r.input, outputTokens: r.output, at: r.at }]));
}

/** Delete every usage row (data reset). */
export async function clearUsage(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM usage');
}
