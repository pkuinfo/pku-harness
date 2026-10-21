import type { ProviderModel } from '@/core/runtime/types';
import type { MessageKey } from '@/i18n';

/** Pure helpers for the AI step (unit-tested in ai-helpers.test.ts). */

/**
 * A failure in words a student can act on (never echoes the key). `tr` is the translator
 * (`t` from src/i18n; tests pass the identity to read back the dictionary key).
 */
export function describeVerifyError(e: unknown, tr: (key: MessageKey) => string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/HTTP 401|HTTP 403|unauthori[sz]ed|invalid.*key|authentication/i.test(msg)) return tr('welcome.ai.errors.badKey');
  if (/HTTP 402|insufficient|balance/i.test(msg)) return tr('welcome.ai.errors.balance');
  if (/HTTP 404/.test(msg)) return tr('welcome.ai.errors.notFound');
  if (/HTTP 429/.test(msg)) return tr('welcome.ai.errors.rateLimit');
  if (/HTTP 5\d\d/.test(msg)) return tr('welcome.ai.errors.server');
  if (msg === 'timeout') return tr('welcome.ai.errors.timeout');
  if (/network|fetch|failed to connect|unable to resolve|ENOTFOUND|ECONN/i.test(msg)) return tr('welcome.ai.errors.network');
  return msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
}

/** Catalog first (with names), then live-listed ids not in it (capped). */
export function mergeModels(catalog: ProviderModel[], listed: ProviderModel[] | null, cap = 8): ProviderModel[] {
  if (!listed?.length) return catalog;
  const known = new Set(catalog.map((m) => m.id));
  return [...catalog, ...listed.filter((m) => !known.has(m.id)).slice(0, cap)];
}

/** A provider's credential hint (`在 platform.deepseek.com 的 API Keys 页面创建`) → the domain, to make it a link. */
export function hintLink(hint: string | undefined): { before: string; domain: string; after: string } | null {
  if (!hint) return null;
  const m = /([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s，。]*)?/i.exec(hint);
  if (!m) return null;
  return { before: hint.slice(0, m.index), domain: m[0], after: hint.slice(m.index + m[0].length) };
}
