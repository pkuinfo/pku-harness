import type { ProviderModel } from '@/core/runtime/types';

/** Pure helpers for the AI step (unit-tested in ai-helpers.test.ts). */

/** A failure in words a student can act on (never echoes the key). */
export function describeVerifyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/HTTP 401|HTTP 403|unauthori[sz]ed|invalid.*key|authentication/i.test(msg)) return 'API Key 无效或已停用，请检查后重试';
  if (/HTTP 402|insufficient|balance/i.test(msg)) return '账户余额不足，请先在服务商平台充值';
  if (/HTTP 404/.test(msg)) return '接口地址不对，请确认 Base URL（通常以 /v1 结尾）';
  if (/HTTP 429/.test(msg)) return '请求太频繁，稍等片刻再试';
  if (/HTTP 5\d\d/.test(msg)) return '服务商暂时不可用，稍后再试';
  if (msg === 'timeout') return '连接超时，请检查网络后重试';
  if (/network|fetch|failed to connect|unable to resolve|ENOTFOUND|ECONN/i.test(msg)) return '连不上服务，请检查网络或接口地址';
  return msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
}

/** Catalog first (with names), then live-listed ids not in it (capped). */
export function mergeModels(catalog: ProviderModel[], listed: ProviderModel[] | null, cap = 8): ProviderModel[] {
  if (!listed?.length) return catalog;
  const known = new Set(catalog.map((m) => m.id));
  return [...catalog, ...listed.filter((m) => !known.has(m.id)).slice(0, cap)];
}

/** `在 platform.deepseek.com 的 API Keys 页面创建` → the domain, to make it a link. */
export function hintLink(hint: string | undefined): { before: string; domain: string; after: string } | null {
  if (!hint) return null;
  const m = /([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s，。]*)?/i.exec(hint);
  if (!m) return null;
  return { before: hint.slice(0, m.index), domain: m[0], after: hint.slice(m.index + m[0].length) };
}
