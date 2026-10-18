import { useSyncExternalStore } from 'react';

import { kv } from '@/core/store/kv';
import { secrets } from '@/core/store/secrets';

import { APP_HEADERS, campusFetch, FORM, form, resetSession, type CampusResponse, type RequestOptions } from './http';
import { iaaaLogin, PORTAL_APP } from './iaaa';

/**
 * The campus account (docs/ARCHITECTURE.md §9). Credentials live only in SecureStore; the
 * harness signs in to each service itself and hands plugins authenticated responses through
 * `services.campus.request`, never the password.
 */

export type CampusService = 'card' | 'its';

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
    resetSession('iaaa'),
    resetSession('card'),
    resetSession('its'),
  ]);
  itsReady = false;
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

/** Authenticated request to a campus service on behalf of a plugin. */
export function campusRequest(service: CampusService, req: RequestOptions): Promise<CampusResponse> {
  return service === 'card' ? cardRequest(req) : itsRequest(req);
}
