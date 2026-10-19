import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { kv } from '@/core/store/kv';
import { secrets } from '@/core/store/secrets';

import { APP_HEADERS, campusFetch, cookieValue, FORM, form, resetSession, type CampusResponse, type RequestOptions } from './http';
import { iaaaLogin, PORTAL_APP, type IaaaApp } from './iaaa';

/**
 * The campus account (docs/ARCHITECTURE.md §9). Credentials live only in SecureStore; the
 * harness signs in to each service itself and hands plugins authenticated responses through
 * `services.campus.request`, never the password.
 */

export type CampusService = 'card' | 'its' | 'treehole' | 'blackboard';

type State = { signedIn: boolean; username: string | null; signedInAt: number | null };

const store = kv('campus');
let state: State = { signedIn: false, username: null, signedInAt: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const campusAccount = {
  async load() {
    state = (await store.get<State>('state')) ?? state;
    emit();
  },
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useCampusAccount() {
  return useSyncExternalStore(campusAccount.subscribe, campusAccount.get);
}

async function setState(next: State) {
  state = next;
  emit();
  await store.set('state', next);
}

async function credentials() {
  const [username, password] = await Promise.all([secrets.get('campus.username'), secrets.get('campus.password')]);
  if (!username || !password) throw new Error('还没有登录校园账号（设置 → 校园账号）');
  return { username, password };
}

/**
 * Sign in: verify with IAAA (the portal app), then store the credentials. `otp` is the 手机令牌
 * code when IAAA asks for it; it is used once and not stored.
 */
export async function signIn(username: string, password: string, otp?: string) {
  const id = username.trim();
  await resetSession('iaaa');
  const token = await iaaaLogin(PORTAL_APP, id, password, otp?.trim() || undefined);
  await secrets.set('campus.username', id);
  await secrets.set('campus.password', password);
  await setState({ signedIn: true, username: id, signedInAt: Date.now() });
  // Warm the card session with this token so the first card request needs no second login.
  await cardFromIaaaToken(token).catch(() => {});
}

export async function signOut() {
  await Promise.all([
    secrets.delete('campus.username'),
    secrets.delete('campus.password'),
    secrets.delete('campus.card.jwt'),
    secrets.delete('campus.treehole'),
    resetSession('iaaa'),
    resetSession('card'),
    resetSession('its'),
    resetSession('treehole'),
    resetSession('blackboard'),
  ]);
  itsReady = false;
  bbReady = false;
  await setState({ signedIn: false, username: null, signedInAt: null });
}

// ── Campus card (bdcard.pku.edu.cn) ───────────────────────────────────────────────────────────
// pkucli crates/campuscard/src/login.rs `complete_login`: portal ssoLogin (SESSION cookie) →
// util/redirectToCard.do (302) → berserker-auth/cas/login/pku (302 with synjones-auth=<JWT>).

const PORTAL_BASE = 'https://portal.pku.edu.cn/portal2017';
export const CARD_BASE = 'https://bdcard.pku.edu.cn';
const CARD_JWT_TTL = 23 * 3600_000; // pkucli assumes 24 h

async function cardFromIaaaToken(iaaaToken: string): Promise<string> {
  await resetSession('card');
  const sso = await campusFetch('card', { url: `${PORTAL_APP.redirectUrl}?_rand=${Math.random()}&token=${encodeURIComponent(iaaaToken)}`, headers: APP_HEADERS });
  if (sso.status >= 400) throw new Error(`门户登录失败（HTTP ${sso.status}）`);
  const toCard = await campusFetch('card', { url: `${PORTAL_BASE}/util/redirectToCard.do`, headers: APP_HEADERS });
  if (!toCard.location) throw new Error(`获取校园卡授权失败（HTTP ${toCard.status}）`);
  const auth = await campusFetch('card', { url: toCard.location, headers: APP_HEADERS });
  const jwt = auth.location ? /[?&]synjones-auth=([^&#]+)/.exec(auth.location)?.[1] : undefined;
  if (!jwt) throw new Error('校园卡登录失败：未拿到凭证');
  const value = decodeURIComponent(jwt);
  await secrets.set('campus.card.jwt', JSON.stringify({ jwt: value, exp: Date.now() + CARD_JWT_TTL }));
  return value;
}

async function cardJwt(force = false): Promise<string> {
  if (!force) {
    const saved = await secrets.get('campus.card.jwt');
    if (saved) {
      const { jwt, exp } = JSON.parse(saved) as { jwt: string; exp: number };
      if (exp > Date.now()) return jwt;
    }
  }
  const { username, password } = await credentials();
  await resetSession('iaaa');
  return cardFromIaaaToken(await iaaaLogin(PORTAL_APP, username, password));
}

async function cardRequest(req: RequestOptions, retried = false): Promise<CampusResponse> {
  const jwt = await cardJwt();
  const res = await campusFetch('card', {
    ...req,
    url: req.url.startsWith('http') ? req.url : `${CARD_BASE}${req.url}`,
    followRedirects: true,
    headers: { ...APP_HEADERS, 'synjones-auth': `bearer ${jwt}`, synaccesssource: 'h5', ...req.headers },
  });
  // An expired JWT answers 401 (pkucli api.rs check_resp); refresh once.
  const expired = res.status === 401 || /"code"\s*:\s*401/.test(res.body.slice(0, 200));
  if (expired && !retried) {
    await cardJwt(true);
    return cardRequest(req, true);
  }
  return res;
}

// ── Network (its.pku.edu.cn) ──────────────────────────────────────────────────────────────────
// pkucli crates/portal/src/netfee.rs: not IAAA — the 上网账号 login, usually the same password.

export const ITS_BASE = 'https://its.pku.edu.cn';
let itsReady = false;

async function itsLogin() {
  const { username, password } = await credentials();
  await resetSession('its');
  const res = await campusFetch('its', {
    url: `${ITS_BASE}/cas/webLogin`,
    method: 'POST',
    contentType: FORM,
    followRedirects: true,
    headers: { referer: 'https://its.pku.edu.cn/' },
    body: form({ iprange: 'yes', rid: '', username, password }),
  });
  if (res.body.includes('alert(') && res.body.includes('history.back')) {
    const msg = /alert\("([^"]+)"\)/.exec(res.body)?.[1];
    throw new Error(`网络账号登录失败：${msg ?? '未知原因'}`);
  }
  itsReady = true;
  return res;
}

async function itsRequest(req: RequestOptions, retried = false): Promise<CampusResponse> {
  if (!itsReady) await itsLogin();
  const res = await campusFetch('its', {
    ...req,
    url: req.url.startsWith('http') ? req.url : `${ITS_BASE}${req.url}`,
    followRedirects: true,
    headers: { referer: 'https://its.pku.edu.cn/', ...req.headers },
  });
  // A dropped session lands back on the login form; sign in again once.
  if (!retried && /name=["']?password/.test(res.body) && /webLogin/.test(res.body)) {
    itsReady = false;
    return itsRequest(req, true);
  }
  return res;
}

// ── Treehole (treehole.pku.edu.cn) ────────────────────────────────────────────────────────────
// pkucli crates/treehole/src/login.rs: IAAA as "PKU Helper" → GET chapi/cas_iaaa_login with the
// token → 302 to iaaa_success?token=<JWT>&expires_in=<unix s>&uid=… (or pku_token cookies).
// api.rs: every call sends `authorization: Bearer <JWT>` and `uuid: Web_PKUHOLE_2.0.0_WEB_UUID_…`.

export const TREEHOLE_BASE = 'https://treehole.pku.edu.cn';
type TreeholeSession = { jwt: string; exp: number; uuid: string; device: string };

const treeholeApp = (device: string): IaaaApp => ({
  appId: 'PKU Helper',
  redirectUrl: `${TREEHOLE_BASE}/chapi/cas_iaaa_login?version=3&uuid=${device}&plat=web`,
});

const queryParam = (url: string, name: string) => {
  const v = new RegExp(`[?&]${name}=([^&#]*)`).exec(url)?.[1];
  return v == null ? null : decodeURIComponent(v);
};

async function treeholeLogin(): Promise<TreeholeSession> {
  const { username, password } = await credentials();
  const saved = await secrets.get('campus.treehole');
  // The short device id is kept across logins (login.rs get_device_uuid: last 12 hex chars).
  const device = saved ? (JSON.parse(saved) as TreeholeSession).device : Crypto.randomUUID().replace(/-/g, '').slice(20);
  await resetSession('iaaa');
  const token = await iaaaLogin(treeholeApp(device), username, password);
  await resetSession('treehole');
  const cb = await campusFetch('treehole', {
    url: `${treeholeApp(device).redirectUrl}&_rand=${Math.random()}&token=${encodeURIComponent(token)}`,
    headers: { accept: 'application/json, text/plain, */*' },
  });
  const jwt = cb.location ? queryParam(cb.location, 'token') : cookieValue('treehole', TREEHOLE_BASE, 'pku_token');
  const expires = Number((cb.location ? queryParam(cb.location, 'expires_in') : cookieValue('treehole', TREEHOLE_BASE, 'pku_expires_in')) ?? 0);
  if (!jwt) throw new Error(`树洞登录失败：未拿到凭证（HTTP ${cb.status}）`);
  const session: TreeholeSession = {
    jwt,
    // expires_in is a unix timestamp in seconds (login.rs format_timestamp); keep a margin.
    exp: expires > 0 ? expires * 1000 - 600_000 : Date.now() + 24 * 3600_000,
    uuid: `Web_PKUHOLE_2.0.0_WEB_UUID_${Crypto.randomUUID().slice(0, 23)}-${device}`,
    device,
  };
  await secrets.set('campus.treehole', JSON.stringify(session));
  // login.rs touches /chapi/version once to refresh cookies before the first API call.
  await campusFetch('treehole', { url: `${TREEHOLE_BASE}/chapi/version?t=${Date.now()}`, headers: treeholeHeaders(session) }).catch(() => {});
  return session;
}

const treeholeHeaders = (s: TreeholeSession) => ({ authorization: `Bearer ${s.jwt}`, uuid: s.uuid, accept: 'application/json, text/plain, */*' });

async function treeholeSession(force = false): Promise<TreeholeSession> {
  if (!force) {
    const saved = await secrets.get('campus.treehole');
    if (saved) {
      const s = JSON.parse(saved) as TreeholeSession;
      if (s.exp > Date.now()) return s;
    }
  }
  return treeholeLogin();
}

async function treeholeRequest(req: RequestOptions, retried = false): Promise<CampusResponse> {
  const s = await treeholeSession();
  const res = await campusFetch('treehole', {
    ...req,
    url: req.url.startsWith('http') ? req.url : `${TREEHOLE_BASE}${req.url}`,
    headers: { ...treeholeHeaders(s), ...req.headers },
  });
  // api.rs parse_response: HTTP 401 = the JWT is no longer valid; sign in again once.
  if (res.status === 401 && !retried) {
    await treeholeSession(true);
    return treeholeRequest(req, true);
  }
  return res;
}

// ── Blackboard (course.pku.edu.cn, 教学网) ───────────────────────────────────────────────────
// pkucli crates/course/src/login.rs: IAAA as "blackboard" → GET campusLogin?token=… builds the
// cookie session; client.rs uses a desktop browser UA. api.rs get_homepage: a lost session ends
// on a login page or IAAA.

export const BB_BASE = 'https://course.pku.edu.cn';
const BB_APP: IaaaApp = { appId: 'blackboard', redirectUrl: 'http://course.pku.edu.cn/webapps/bb-sso-BBLEARN/execute/authValidate/campusLogin' };
const BB_HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};
let bbReady = false;

async function bbLogin() {
  const { username, password } = await credentials();
  await resetSession('iaaa');
  const token = await iaaaLogin(BB_APP, username, password);
  await resetSession('blackboard');
  const sso = await campusFetch('blackboard', {
    url: `${BB_BASE}/webapps/bb-sso-BBLEARN/execute/authValidate/campusLogin?_rand=${Math.random()}&token=${encodeURIComponent(token)}`,
    followRedirects: true,
    headers: BB_HEADERS,
  });
  if (sso.status >= 400) throw new Error(`教学网登录失败（HTTP ${sso.status}）`);
  bbReady = true;
}

function bbLoggedOut(res: CampusResponse) {
  const path = /^https?:\/\/[^/]+([^?#]*)/.exec(res.url)?.[1] ?? '';
  return path.includes('login') || res.url.includes('iaaa.pku.edu.cn') || (res.body.includes('IAAA') && res.body.includes('login'));
}

async function bbRequest(req: RequestOptions, retried = false): Promise<CampusResponse> {
  if (!bbReady) await bbLogin();
  const res = await campusFetch('blackboard', {
    ...req,
    url: req.url.startsWith('http') ? req.url : `${BB_BASE}${req.url}`,
    followRedirects: true,
    headers: { ...BB_HEADERS, ...req.headers },
  });
  if (!retried && (res.status === 401 || bbLoggedOut(res))) {
    bbReady = false;
    return bbRequest(req, true);
  }
  return res;
}

/** Authenticated request to a campus service on behalf of a plugin. */
export function campusRequest(service: CampusService, req: RequestOptions): Promise<CampusResponse> {
  if (service === 'card') return cardRequest(req);
  if (service === 'treehole') return treeholeRequest(req);
  if (service === 'blackboard') return bbRequest(req);
  return itsRequest(req);
}
