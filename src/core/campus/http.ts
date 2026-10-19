import CampusHttp, { type CampusResponse, type RequestOptions, type StoredCookie } from '../../../modules/campus-http';

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

export type CampusSessionId = 'iaaa' | 'card' | 'its' | 'treehole' | 'blackboard';

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

/** One request in a session; Set-Cookie updates the session's jar (persisted afterwards). */
export async function campusFetch(id: CampusSessionId, req: RequestOptions): Promise<CampusResponse> {
  await ensure(id);
  const res = await CampusHttp.request(id, req);
  persist(id).catch(() => {});
  return res;
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

export type { CampusResponse, RequestOptions };
