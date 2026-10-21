import forge from 'node-forge';

/**
 * Response decoding and login-redirect parsing for 北京大学收费平台 (cwpay.pku.edu.cn), pure so
 * they can be unit-tested. Captured from the live site (2026-10-21, mobile bundle
 * /mobile/js/app.43b046a6.js, module "49b9" `h()` used by the axios response interceptor):
 *
 *   body = rand(10) + reverse(key)(32) + rand(10) + base64(AES-256-ECB(PKCS7, key, json)) + rand(10)
 *
 * i.e. the key is `body.slice(10, 42)` reversed (UTF-8, 32 chars) and the ciphertext is
 * `body.substr(52).slice(0, -10)`. Error answers (HTTP 500, `{"messageCode":"8100",…}`) and
 * non-JSON content types come back as plain text. Request bodies are not encrypted.
 */
export function decodeCwpayBody(body: string): string {
  const text = body.trim();
  if (!text || text.startsWith('{') || text.startsWith('[') || text.startsWith('<') || text.length < 64) return body;
  try {
    const key = text.slice(10, 42).split('').reverse().join('');
    const cipherText = forge.util.decode64(text.substring(52).slice(0, -10));
    const decipher = forge.cipher.createDecipher('AES-ECB', key);
    decipher.start();
    decipher.update(forge.util.createBuffer(cipherText));
    if (!decipher.finish()) return body;
    return forge.util.decodeUtf8(decipher.output.getBytes());
  } catch {
    return body;
  }
}

export type CwpayEnvelope = { messageCode?: string | number; message?: string; code?: number; data?: unknown };

/** The `{messageCode, message, data}` envelope, or null when the body isn't one. */
export function parseEnvelope(body: string): CwpayEnvelope | null {
  try {
    const j = JSON.parse(body) as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as CwpayEnvelope) : null;
  } catch {
    return null;
  }
}

/**
 * The SPA's interceptor: messageCode "0" / "6003" = ok; "-3" = token renewed (data = new token,
 * replay the request); "-1" / "-2" / code 50014 = signed out; "-4" = forced logout.
 */
export function envelopeState(env: CwpayEnvelope | null): 'ok' | 'renew' | 'signedOut' | 'error' | 'unknown' {
  if (!env) return 'unknown';
  const code = String(env.messageCode ?? '');
  if (code === '0' || code === '6003') return 'ok';
  if (code === '-3') return 'renew';
  if (code === '-1' || code === '-2' || code === '-4' || env.code === 50014) return 'signedOut';
  return code ? 'error' : 'unknown';
}

/**
 * Query parameters of a hash-router URL (`https://cwpay.pku.edu.cn/#/middle_page?token=…&jsonData=…`).
 * The SPA routes live after `#`, so URLSearchParams on the real query would miss them.
 */
export function hashQuery(url: string): Record<string, string> {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : url;
  const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const out: Record<string, string> = {};
  for (const part of q.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq < 0 ? part : part.slice(0, eq);
    const v = eq < 0 ? '' : part.slice(eq + 1);
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export type DealcasResult = { ok: true; token: string; jsonData: string | null } | { ok: false; error: string } | null;

/**
 * Where /dealcas/?token=<iaaa token> sends the browser. Success (the PC SPA's MiddlePage,
 * static/js/chunk-2d0d007f): `/#/middle_page?token=<X-Token>&jsonData=…[&domain_url_wap=…]`.
 * Failure (captured live with a bad token): `/#/middle_page_error?errorMsg=系统错误，统一登录系统token验证失败`.
 * null = not the final hop yet.
 */
export function parseDealcasLocation(location: string): DealcasResult {
  if (/#\/middle_page_error/.test(location)) return { ok: false, error: hashQuery(location).errorMsg || '收费平台登录失败' };
  if (!/#\/middle_page\b/.test(location)) return null;
  const q = hashQuery(location);
  if (!q.token) return { ok: false, error: '收费平台没有返回登录凭证' };
  return { ok: true, token: q.token, jsonData: q.jsonData || null };
}
