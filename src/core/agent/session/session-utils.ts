/**
 * Pure helpers for sessions (docs/AGENT-HARNESS.md §2): no React Native imports, so they run
 * under `bun test`. The store (chat-store.ts) and the run loop (run.ts) build on these.
 */
import type { ModelMessage } from 'ai';

import type { MessageKey, Params } from '@/i18n';

import type { AttachmentPart, ChatMessage, ChatPart } from './chat-store';

/** Plain text a message shows (text parts only). */
export function textOf(m: Pick<ChatMessage, 'parts'> | undefined): string {
  if (!m) return '';
  return m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
}

export function attachmentsOf(m: Pick<ChatMessage, 'parts'> | undefined): AttachmentPart[] {
  if (!m) return [];
  return m.parts.filter((p): p is AttachmentPart => p.type === 'attachment');
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Title until the auto title arrives: the first 16 chars of the first user message. */
export function fallbackTitle(messages: ChatMessage[]): string | null {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return null;
  const text = squash(textOf(first)) || attachmentsOf(first)[0]?.name || '';
  if (!text) return null;
  return [...text].length > 16 ? [...text].slice(0, 16).join('') + '…' : text;
}

/** First ~60 chars of the last user message, for the sessions list. */
export function previewOf(messages: ChatMessage[]): string {
  const last = messages.findLast((m) => m.role === 'user');
  if (!last) return '';
  const text = squash(textOf(last)) || attachmentsOf(last).map((a) => a.name).join('、');
  return [...text].slice(0, 60).join('');
}

/** Strip what models add despite the instruction: quotes, a "标题：" label, trailing punctuation. */
export function cleanTitle(raw: string): string | null {
  let t = raw.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  t = t.replace(/^(标题|主题|title)\s*[:：]\s*/i, '');
  t = t.replace(/^["'“”‘’「」《》【】\s]+|["'“”‘’「」《》【】\s。．.，,！!？?；;：:]+$/g, '');
  if (!t) return null;
  const chars = [...t];
  // Chinese titles are ≤ 12 characters by request; English ones are ≤ 5 words, cut on a word.
  if (/[\u3400-\u9fff]/.test(t)) return chars.length > 20 ? chars.slice(0, 20).join('') : t;
  if (chars.length <= 48) return t;
  const head = chars.slice(0, 48).join('');
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).replace(/[\s,.;:-]+$/, '');
}

/** A translator: `t` from '@/i18n' or the function `useT()` returns (keeps this module pure). */
export type Tr = (key: MessageKey, params?: Params) => string;

/** Messages that count (notices and compaction markers don't). */
export const countMessages = (messages: ChatMessage[]) => messages.filter((m) => m.role !== 'event').length;

/**
 * A record loaded from disk can hold a turn that was still running when the app died. Tools
 * still `running` become errors, and the reply that was streaming (`runningId`) is marked
 * interrupted so the UI offers 重试 instead of spinning forever.
 */
export function markInterrupted(messages: ChatMessage[], runningId?: string, label = '已中断'): { messages: ChatMessage[]; changed: boolean } {
  let changed = false;
  const out = messages.map((m) => {
    let parts = m.parts;
    if (m.parts.some((p) => p.type === 'tool' && p.status === 'running')) {
      parts = m.parts.map((p): ChatPart => (p.type === 'tool' && p.status === 'running' ? { ...p, status: 'error', error: label } : p));
    }
    const interrupted = m.role === 'assistant' && m.id === runningId && !m.meta?.ended;
    if (parts === m.parts && !interrupted) return m;
    changed = true;
    return { ...m, parts, ...(interrupted ? { meta: { ...m.meta, ended: 'interrupted' as const } } : null) };
  });
  return { messages: changed ? out : messages, changed };
}

/**
 * Cut a session just before one of its user messages (edit & resend, regenerate, retry). The UI
 * keeps everything before it; the model history is cut at the matching user turn, counted from
 * the end (compaction rewrites the start of the history but keeps the recent tail whole). If
 * that turn was already compacted away, the history can't be cut cleanly and is dropped.
 */
export function cutBefore(
  messages: ChatMessage[],
  history: ModelMessage[],
  messageId: string,
): { messages: ChatMessage[]; history: ModelMessage[]; exact: boolean } | null {
  const at = messages.findIndex((m) => m.id === messageId);
  if (at < 0 || messages[at].role !== 'user') return null;
  const fromEnd = messages.slice(at).filter((m) => m.role === 'user').length;
  let seen = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'user') continue;
    seen++;
    if (seen === fromEnd) return { messages: messages.slice(0, at), history: history.slice(0, i), exact: true };
  }
  return { messages: messages.slice(0, at), history: [], exact: false };
}

/** Text the model sees for a user turn: what was typed plus text attachments inline (§4.2). */
export function userText(text: string, attachments: AttachmentPart[] = []): string {
  const inline = attachments
    .filter((a) => a.kind === 'text' && a.text != null)
    .map((a) => `<attachment name="${a.name.replace(/"/g, "'")}">\n${a.text}\n</attachment>`);
  return [text, ...inline].filter(Boolean).join('\n\n');
}

/** Sessions sheet sections; titles are `chat.sessions.sections.<id>` (置顶/今天/昨天/7 天内/更早). */
export type Section = 'pinned' | 'today' | 'yesterday' | 'week' | 'earlier';
export const SECTIONS: Section[] = ['pinned', 'today', 'yesterday', 'week', 'earlier'];

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const DAY = 86_400_000;

export function sectionOf(ts: number, now = Date.now()): Exclude<Section, 'pinned'> {
  const today = startOfDay(now);
  if (ts >= today) return 'today';
  if (ts >= today - DAY) return 'yesterday';
  if (ts >= today - 6 * DAY) return 'week';
  return 'earlier';
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Short relative time for list rows, in the language of `tr`: 刚刚, 5 分钟前, 14:20, 昨天, 周二,
 * 10月3日, 2025/10/3 / Just now, 5 min ago, 14:20, Yesterday, Tue, Oct 3, Oct 3, 2025.
 */
export function relativeTime(ts: number, tr: Tr, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return tr('chat.time.justNow');
  const d = new Date(ts);
  if (ts >= startOfDay(now)) {
    if (diff < 3_600_000) return tr('chat.time.minutesAgo', { count: Math.floor(diff / 60_000) });
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (ts >= startOfDay(now) - DAY) return tr('chat.time.yesterday');
  if (ts >= startOfDay(now) - 6 * DAY) return tr('chat.time.weekdays').split(',')[d.getDay()];
  const date = { month: tr('chat.time.months').split(',')[d.getMonth()], monthNum: d.getMonth() + 1, day: d.getDate(), year: d.getFullYear() };
  if (d.getFullYear() === new Date(now).getFullYear()) return tr('chat.time.monthDay', date);
  return tr('chat.time.fullDate', date);
}

type Listable = { id: string; title: string | null; preview: string; pinned: boolean; updatedAt: number };

/** Filter (title + preview, case-insensitive) and group for the sessions sheet. */
export function groupSessions<T extends Listable>(list: T[], query = '', now = Date.now()): { section: Section; items: T[] }[] {
  const q = query.trim().toLowerCase();
  const hits = q ? list.filter((s) => `${s.title ?? ''}\n${s.preview}`.toLowerCase().includes(q)) : list;
  const sorted = [...hits].sort((a, b) => b.updatedAt - a.updatedAt);
  const by = new Map<Section, T[]>();
  for (const s of sorted) {
    const key: Section = s.pinned ? 'pinned' : sectionOf(s.updatedAt, now);
    by.set(key, [...(by.get(key) ?? []), s]);
  }
  return SECTIONS.filter((s) => by.has(s)).map((section) => ({ section, items: by.get(section)! }));
}

/** The next queued message to send automatically, if the queue may run. */
export function nextQueued<T>(queue: T[], paused: boolean): T | undefined {
  return paused ? undefined : queue[0];
}

/** Thin token formatting for captions: 860, 12.4k, 1.2M. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * Reply footer caption (§6.5), in the language of `tr`: `Flash · 9.2s · 输入 12.4k（缓存 86%）· 输出 860`
 * / `Flash · 9.2s · In 12.4k (86% cached) · Out 860`.
 */
export function turnCaption(
  meta: { model?: string; durationMs?: number; inputTokens?: number; cachedInputTokens?: number; outputTokens?: number },
  modelLabel: string | undefined,
  tr: Tr,
): string {
  const parts: string[] = [];
  const name = modelLabel ?? meta.model;
  if (name) parts.push(name);
  if (meta.durationMs != null) parts.push(`${(meta.durationMs / 1000).toFixed(1)}s`);
  if (meta.inputTokens != null) {
    const value = formatTokens(meta.inputTokens);
    const cached = meta.inputTokens > 0 && meta.cachedInputTokens ? Math.round((meta.cachedInputTokens / meta.inputTokens) * 100) : 0;
    parts.push(cached ? tr('chat.caption.inputCached', { value, pct: cached }) : tr('chat.caption.input', { value }));
  }
  if (meta.outputTokens != null) parts.push(tr('chat.caption.output', { value: formatTokens(meta.outputTokens) }));
  // A full-width bracket already spaces itself: '…（缓存 86%）· 输出'.
  return parts.join(' · ').replace('） · ', '）· ');
}

/** Row in the `sessions` table (migration 2) ↔ the parts of SessionMeta that persist. */
export type SessionRow = {
  id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  pinned: number | null;
  title_source: string | null;
  preview: string | null;
  provider_id: string | null;
  model: string | null;
  message_count: number | null;
  unread: number | null;
};

export type PersistedMeta = {
  id: string;
  title: string | null;
  titleSource: 'fallback' | 'auto' | 'user';
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  preview: string;
  providerId?: string;
  model?: string;
  messageCount: number;
  unread: boolean;
};

export function fromRow(r: SessionRow): PersistedMeta {
  const source = r.title_source === 'auto' || r.title_source === 'user' ? r.title_source : 'fallback';
  return {
    id: r.id,
    title: r.title,
    titleSource: source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    pinned: !!r.pinned,
    preview: r.preview ?? '',
    providerId: r.provider_id ?? undefined,
    model: r.model ?? undefined,
    messageCount: r.message_count ?? 0,
    unread: !!r.unread,
  };
}

export function toRow(m: PersistedMeta): SessionRow {
  return {
    id: m.id,
    title: m.title,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    pinned: m.pinned ? 1 : 0,
    title_source: m.titleSource,
    preview: m.preview,
    provider_id: m.providerId ?? null,
    model: m.model ?? null,
    message_count: m.messageCount,
    unread: m.unread ? 1 : 0,
  };
}

/** The single pre-sessions conversation (kv('chat')/current) as the first session. */
export function legacySession(saved: { messages?: ChatMessage[]; history?: ModelMessage[] } | undefined, id: string, now = Date.now()) {
  const messages = saved?.messages ?? [];
  if (!messages.length) return null;
  const last = messages.at(-1)?.createdAt ?? now;
  const meta: PersistedMeta = {
    id,
    title: fallbackTitle(messages),
    titleSource: 'fallback',
    createdAt: messages[0]?.createdAt ?? now,
    updatedAt: last,
    pinned: false,
    preview: previewOf(messages),
    messageCount: countMessages(messages),
    unread: false,
  };
  return { meta, record: { messages, history: saved?.history ?? [] } };
}
