import { credentials, registerCampusService } from '../account';
import { campusFetch, resetSession, type CampusResponse, type RequestOptions } from '../http';
import { iaaaSignIn, type IaaaApp } from '../iaaa';

import { secrets } from '@/core/store/secrets';

/**
 * 北京大学图书馆 (lib.pku.edu.cn). Not covered by pkucli: both flows were captured from the live
 * sites (2026-10) and from their front-end bundles. Two services:
 *
 * `library`: 一站式个人中心 (a.lib.pku.edu.cn/portal, FOLIO Okapi "mod-pku-oneStation"): loans,
 *   renewals, holds. Sign-in, as the portal does it:
 *   1. GET sso.lib.pku.edu.cn/oauth/authorize?client_id=oneStopWeb&redirect_uri=https://a.lib.pku.edu.cn:8443/sso/login
 *      → sets IAM_LOGIN_REQ and 302s to IAAA oauthLib.jsp?appID=lib_sso&redirectUrl=…/iaaa/ssologin?loginReqId=…
 *   2. IAAA password login for that app + redirectUrl (iaaaSignIn: SMS / 手机令牌 when asked)
 *   3. GET redirectUrl&_rand=…&token=… → 302 a.lib:8443/sso/login?code=… → 302 a.lib/portal/main?code=<session>
 *   4. The portal keeps `code` as its session ("pkulib_session") and passes it as a query/body
 *      field to /prod-api/* (header x-okapi-tenant: pkulib). A dead session answers
 *      getMyInfobySession with `data: null`.
 *   Plugins write the literal `{session}` where the session goes (url or JSON body); the adapter
 *   substitutes it, so the plugin never holds the token.
 *
 * `library-space`: IC 空间预约 (kjyy.lib.pku.edu.cn, Unifound "ic-web"): 研讨室 and 研修专座.
 *   1. GET /ic-web/auth/address?finalAddress=… → { data: /authcenter/toLoginPage?redirectUrl=…/ic-web//auth/token?uuid=… }
 *   2. GET that → 302 IAAA oauth.jsp?appID=unifound-auth-center&redirectUrl=…/authcenter/doAuth?uuid=…
 *   3. IAAA login, then GET doAuth&_rand=…&token=… and follow (cookies land in the session jar)
 *   4. GET /ic-web/auth/userInfo → { code: 0, data: { token, accNo, … } }; later calls send
 *      header `token`. code 300 = "用户未登录" → sign in again once.
 *   The token is stripped from the userInfo response before it reaches the plugin.
 */

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const resolveUrl = (location: string, base: string) => {
  if (/^https?:\/\//i.test(location)) return location;
  const origin = /^https?:\/\/[^/]+/i.exec(base)?.[0] ?? '';
  return location.startsWith('/') ? origin + location : base.replace(/[^/]*([?#].*)?$/, '') + location;
};

const queryParam = (url: string, name: string) => {
  const m = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
};

/** IAAA's own redirect convention: redirectUrl + (? or &) _rand=…&token=…. */
const withToken = (redirectUrl: string, token: string) =>
  `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}_rand=${Math.random()}&token=${encodeURIComponent(token)}`;

/** The IAAA app a service's login entry redirects to (appID + redirectUrl from the Location). */
function iaaaAppFrom(location: string | null | undefined, service: string): IaaaApp {
  const appId = location ? queryParam(location, 'appID') ?? queryParam(location, 'appId') : null;
  const redirectUrl = location ? queryParam(location, 'redirectUrl') : null;
  if (!location?.includes('iaaa.pku.edu.cn') || !appId || !redirectUrl) throw new Error(`${service}的登录入口没有跳转到统一认证（网站可能改版了）`);
  return { appId, redirectUrl };
}

// ── library: a.lib.pku.edu.cn 个人中心 ─────────────────────────────────────────────────────────

const LIB = 'library';
const ALIB = 'https://a.lib.pku.edu.cn';
const AUTHORIZE =
  'https://sso.lib.pku.edu.cn/oauth/authorize?client_id=oneStopWeb&redirect_uri=https://a.lib.pku.edu.cn:8443/sso/login&response_type=code&state=PCReaderOAuth';
const LIB_HEADERS = { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', 'x-okapi-tenant': 'pkulib', referer: `${ALIB}/portal/main` };
const LIB_SECRET = 'campus.library.session' as const;

let libSession: string | null = null;
let libLoaded = false;
let libSigningIn: Promise<string> | null = null;

async function loadLibSession() {
  if (!libLoaded) {
    libLoaded = true;
    libSession = (await secrets.get(LIB_SECRET).catch(() => null)) ?? null;
  }
  return libSession;
}

/** True when getMyInfobySession says the session is unknown (`data: null`), i.e. sign in again. */
async function libSessionValid(session: string) {
  const res = await campusFetch(LIB, {
    url: `${ALIB}/prod-api/auth/getMyInfobySession?pkulib_session=${encodeURIComponent(session)}`,
    headers: { ...LIB_HEADERS, accept: 'application/json' },
  });
  return res.status < 400 && !deadLibSession(res.body);
}

function deadLibSession(body: string) {
  try {
    const j = JSON.parse(body) as { data?: unknown };
    return j != null && typeof j === 'object' && 'data' in j && j.data == null;
  } catch {
    return false;
  }
}

async function libLogin(): Promise<string> {
  const { username, password } = await credentials();
  await resetSession('iaaa');
  await resetSession(LIB);
  const entry = await campusFetch(LIB, { url: AUTHORIZE, followRedirects: false, headers: LIB_HEADERS });
  const app = iaaaAppFrom(entry.location, '图书馆');
  const token = await iaaaSignIn(app, username, password, '图书馆');

  // Follow the callback chain ourselves: the session is the `code` on the /portal/ landing URL.
  let url = withToken(app.redirectUrl, token);
  let oauthCode: string | null = null;
  let session: string | null = null;
  for (let hop = 0; hop < 10; hop++) {
    const res = await campusFetch(LIB, { url, followRedirects: false, headers: LIB_HEADERS });
    if (res.status >= 400) throw new Error(`图书馆登录失败（HTTP ${res.status}）`);
    if (!(res.status >= 300 && res.status < 400 && res.location)) break;
    url = resolveUrl(res.location, url);
    if (__DEV__) console.log('[library] →', res.status, url.split('?')[0]);
    if (url.includes('iaaa.pku.edu.cn')) throw new Error('图书馆拒绝了统一认证登录，请稍后再试');
    const code = queryParam(url, 'code');
    if (code && /^https?:\/\/a\.lib\.pku\.edu\.cn(:443)?\/portal\//i.test(url)) {
      session = code;
      break;
    }
    if (code) oauthCode = code;
  }
  // Fallback seen in the portal bundle (/auth/code2token): trade the OAuth code for a session.
  if (!session && oauthCode) {
    const res = await campusFetch(LIB, {
      url: `${ALIB}/prod-api/auth/code2token?code=${encodeURIComponent(oauthCode)}`,
      method: 'POST',
      headers: { ...LIB_HEADERS, accept: 'application/json' },
    });
    try {
      const j = JSON.parse(res.body) as { data?: unknown };
      if (typeof j.data === 'string' && j.data) session = j.data;
    } catch {
      // not JSON: fall through to the error below
    }
  }
  if (!session) throw new Error('图书馆登录没有拿到会话（个人中心登录流程可能改了）');
  if (!(await libSessionValid(session))) throw new Error('图书馆登录后会话无效，请稍后再试');
  libSession = session;
  await secrets.set(LIB_SECRET, session).catch(() => {});
  return session;
}

function libSignIn() {
  libSigningIn ??= libLogin().finally(() => {
    libSigningIn = null;
  });
  return libSigningIn;
}

const SESSION_MARK = /\{session\}|%7Bsession%7D/gi;

async function libRequest(req: RequestOptions, retried = false): Promise<CampusResponse> {
  const session = (libSigningIn ? await libSigningIn : await loadLibSession()) ?? (await libSignIn());
  const rawUrl = req.url.startsWith('http') ? req.url : `${ALIB}${req.url}`;
  if (!/^https:\/\/a\.lib\.pku\.edu\.cn\//i.test(rawUrl)) throw new Error('library 服务只接受 a.lib.pku.edu.cn 的地址');
  const url = rawUrl.replace(SESSION_MARK, encodeURIComponent(session));
  const body = req.body?.replace(SESSION_MARK, session);
  const res = await campusFetch(LIB, {
    ...req,
    url,
    body,
    followRedirects: false,
    headers: { ...LIB_HEADERS, accept: 'application/json, text/plain, */*', ...req.headers },
  });
  // Only the account lookup tells a dead session apart reliably (data: null); plugins call it first.
  const lost = res.status === 401 || (url.includes('/auth/getMyInfobySession') && deadLibSession(res.body));
  if (lost && !retried) {
    libSession = null;
    await secrets.delete(LIB_SECRET).catch(() => {});
    await libSignIn();
    return libRequest(req, true);
  }
  if (lost) throw new Error('图书馆登录状态丢失，请稍后再试');
  // Never hand the session back in the URL.
  return { ...res, url: res.url.replace(session, '{session}') };
}

registerCampusService(LIB, {
  request: (req) => libRequest(req),
  async reset() {
    libSession = null;
    libLoaded = true;
    await secrets.delete(LIB_SECRET).catch(() => {});
    await resetSession(LIB);
  },
});

// ── library-space: kjyy.lib.pku.edu.cn IC 空间预约 ─────────────────────────────────────────────

const SPACE = 'library-space';
const KJYY = 'https://kjyy.lib.pku.edu.cn';
const SPACE_HEADERS = {
  'user-agent': UA,
  'accept-language': 'zh-CN,zh;q=0.9',
  accept: 'application/json, text/plain, */*',
  'x-requested-with': 'XMLHttpRequest',
  lan: '1',
};

let spaceToken: string | null = null;
let spaceSigningIn: Promise<void> | null = null;

const spaceCode = (body: string) => {
  try {
    return (JSON.parse(body) as { code?: number }).code;
  } catch {
    return undefined;
  }
};

/** userInfo with the cookie session; remembers the API token, returns false when not signed in. */
async function fetchSpaceToken() {
  const res = await campusFetch(SPACE, { url: `${KJYY}/ic-web/auth/userInfo`, headers: SPACE_HEADERS });
  try {
    const j = JSON.parse(res.body) as { code?: number; data?: { token?: string } | null };
    if (j.code !== 0 || !j.data) return false;
    spaceToken = j.data.token ?? null;
    return true;
  } catch {
    return false;
  }
}

async function spaceLogin() {
  const { username, password } = await credentials();
  await resetSession('iaaa');
  await resetSession(SPACE);
  spaceToken = null;
  const addr = await campusFetch(SPACE, {
    url: `${KJYY}/ic-web/auth/address?finalAddress=${encodeURIComponent(KJYY)}&errPageUrl=${encodeURIComponent(`${KJYY}/#/error`)}&manager=false&consoleType=16`,
    headers: SPACE_HEADERS,
  });
  let entry: string | undefined;
  try {
    entry = (JSON.parse(addr.body) as { data?: string }).data;
  } catch {
    // handled below
  }
  if (!entry || !/^https?:\/\//.test(entry)) throw new Error('空间预约系统没有返回登录地址（kjyy.lib.pku.edu.cn 可能在维护）');
  const toIaaa = await campusFetch(SPACE, { url: entry, followRedirects: false, headers: SPACE_HEADERS });
  const app = iaaaAppFrom(toIaaa.location, '图书馆空间预约');
  const token = await iaaaSignIn(app, username, password, '图书馆空间预约');

  let url = withToken(app.redirectUrl, token);
  for (let hop = 0; hop < 10; hop++) {
    const res = await campusFetch(SPACE, { url, followRedirects: false, headers: SPACE_HEADERS });
    if (res.status >= 400) throw new Error(`空间预约系统登录失败（HTTP ${res.status}）`);
    if (!(res.status >= 300 && res.status < 400 && res.location)) break;
    url = resolveUrl(res.location, url);
    if (__DEV__) console.log('[library-space] →', res.status, url.split('?')[0]);
    if (url.includes('iaaa.pku.edu.cn')) throw new Error('空间预约系统拒绝了统一认证登录，请稍后再试');
    if (!url.startsWith(KJYY)) break;
  }
  if (!(await fetchSpaceToken())) throw new Error('空间预约系统登录后仍显示未登录，请稍后再试');
}

function spaceSignIn() {
  spaceSigningIn ??= spaceLogin().finally(() => {
    spaceSigningIn = null;
  });
  return spaceSigningIn;
}

/** Remove the API token from userInfo before the plugin sees it. */
function scrubUserInfo(body: string) {
  try {
    const j = JSON.parse(body) as { data?: Record<string, unknown> | null };
    if (j.data && typeof j.data === 'object') delete j.data.token;
    return JSON.stringify(j);
  } catch {
    return body;
  }
}

async function spaceRequest(req: RequestOptions, retried = false): Promise<CampusResponse> {
  if (spaceSigningIn) await spaceSigningIn;
  // Persisted cookies first after launch: recover the token without a new IAAA login when possible.
  if (!spaceToken && !retried && !(await fetchSpaceToken())) await spaceSignIn();
  const url = req.url.startsWith('http') ? req.url : `${KJYY}${req.url}`;
  if (!url.startsWith(`${KJYY}/`)) throw new Error('library-space 服务只接受 kjyy.lib.pku.edu.cn 的地址');
  const res = await campusFetch(SPACE, {
    ...req,
    url,
    followRedirects: false,
    headers: { ...SPACE_HEADERS, ...(spaceToken ? { token: spaceToken } : {}), ...req.headers },
  });
  const lost = res.status === 401 || spaceCode(res.body) === 300;
  if (lost && !retried) {
    spaceToken = null;
    await spaceSignIn();
    return spaceRequest(req, true);
  }
  if (lost) throw new Error('空间预约系统登录状态丢失，请稍后再试');
  return /\/auth\/userInfo/.test(url) ? { ...res, body: scrubUserInfo(res.body) } : res;
}

registerCampusService(SPACE, {
  request: (req) => spaceRequest(req),
  async reset() {
    spaceToken = null;
    await resetSession(SPACE);
  },
});
