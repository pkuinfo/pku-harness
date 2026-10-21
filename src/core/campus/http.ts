import CampusHttp, { type CampusResponse, type MultipartOptions, type RequestOptions, type StoredCookie } from '../../../modules/campus-http';

import { secrets } from '@/core/store/secrets';

/**
 * Named campus HTTP sessions over the native module (modules/campus-http): own cookie jar,
 * manual redirects, HTTP/1.1, no proxy. Cookies are session credentials, so they are persisted
 * in SecureStore (never SQLite) and restored when a session is first used after launch.
 */

/** pkucli crates/campuscard/src/client.rs: campus services expect the PKU Android app. */
export const MOBILE_UA =
  'PKUANDROID2.2.0_SM-S938B Dalvik/2.1.0 (Linux; U; Android 15; SM-S938B Build/BP1A.250305.020) okhttp/4.12.0';
export const APP_HEADERS = { 'x-requested-with': 'cn.edu.pku.PKUAndroid' };

/** One cookie jar per service; adapters pick their own id (e.g. 'bdkj'). */
export type CampusSessionId = 'iaaa' | 'card' | 'its' | 'treehole' | 'blackboard' | (string & {});

const cookieKey = (id: CampusSessionId) => `campus.cookies.${id}` as const;

async function ensure(id: CampusSessionId) {
  if (CampusHttp.hasSession(id)) return;
  CampusHttp.createSession(id, { userAgent: MOBILE_UA, followRedirects: false });
  const saved = await secrets.get(cookieKey(id));
  if (saved) {
    try {
      CampusHttp.importCookies(id, JSON.parse(saved) as StoredCookie[]);
    } catch {
      // corrupt cookie blob: start clean
    }
  }
}

async function persist(id: CampusSessionId) {
  const cookies = CampusHttp.exportCookies(id);
  await secrets.set(cookieKey(id), JSON.stringify(cookies));
}

/** Uploads stream whole files; give them more than the default 20 s. */
const UPLOAD_TIMEOUT_MS = 120_000;

/** One request in a session; Set-Cookie updates the session's jar (persisted afterwards). */
export async function campusFetch(id: CampusSessionId, req: RequestOptions): Promise<CampusResponse> {
  await ensure(id);
  if (req.multipart) req = { ...req, method: req.method ?? 'POST', timeoutMs: req.timeoutMs ?? UPLOAD_TIMEOUT_MS };
  let res: CampusResponse;
  try {
    res = await CampusHttp.request(id, req);
  } catch (e) {
    throw networkError(req.url, e);
  }
  persist(id).catch(() => {});
  return res;
}

/**
 * The native rejection reads "Call to function 'CampusHttp.request' has been rejected. → Caused
 * by: connection closed", which means nothing to a user or the model. Keep the cause, name the
 * host, and say what usually causes it (site down for maintenance, closed outside its window, or
 * campus network only).
 */
function networkError(url: string, e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const cause = /Caused by:\s*(.+)$/s.exec(raw)?.[1]?.trim() || raw;
  const host = /^https?:\/\/([^/:?#]+)/i.exec(url)?.[1] ?? url;
  return new Error(`无法连接 ${host}（${cause}）：网站可能在维护或暂未开放，部分服务也只能在校园网内访问`);
}

export const form = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

export const FORM = 'application/x-www-form-urlencoded; charset=UTF-8';

/** Forget a session's cookies (logout, or a stale session that must sign in again). */
export async function resetSession(id: CampusSessionId) {
  CampusHttp.closeSession(id);
  await secrets.delete(cookieKey(id)).catch(() => {});
}

export function cookieValue(id: CampusSessionId, url: string, name: string) {
  return CampusHttp.hasSession(id) ? CampusHttp.cookieValue(id, url, name) : null;
}

export type { CampusResponse, MultipartOptions, RequestOptions };
