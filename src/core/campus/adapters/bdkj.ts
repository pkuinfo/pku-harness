import { t } from '@/i18n';

import { credentials, registerCampusService, serviceName } from '../account';
import { campusFetch, resetSession, type CampusResponse, type RequestOptions } from '../http';
import { iaaaSignIn, type IaaaApp } from '../iaaa';

// ── 北大空间 (bdkj.pku.edu.cn, 学术研讨教室预约) ─────────────────────────────────────────────
// pkucli crates/bdkj/src/login.rs: IAAA as "bdkj" → GET /login/oauth?token=… plants the SESSION
// cookie. Site redesign (2026-10, captured from a browser session): the IAAA redirect is now
// https://bdkj.pku.edu.cn/login/oauth, the callback 302s to /home, and /personal/user (pkucli's
// session check) is a 404 for everyone, so success = the callback chain ends on a bdkj page
// rather than /oauth (the login entry), /login… or IAAA. client.rs: desktop UA, bdkj referer.

const SESSION = 'bdkj';
export const BDKJ_BASE = 'https://bdkj.pku.edu.cn';
const BDKJ_APP: IaaaApp = { appId: 'bdkj', redirectUrl: `${BDKJ_BASE}/login/oauth` };
const BDKJ_HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh,zh-CN;q=0.9',
  referer: `${BDKJ_BASE}/`,
};

const resolveUrl = (location: string, base: string) => {
  if (/^https?:\/\//i.test(location)) return location;
  const origin = /^https?:\/\/[^/]+/i.exec(base)?.[0] ?? '';
  return location.startsWith('/') ? origin + location : base.replace(/[^/]*([?#].*)?$/, '') + location;
};

/**
 * Follow redirects ourselves (as the Blackboard adapter does) so plain http://bdkj hops are
 * upgraded to HTTPS. A POST answered with 30x continues as GET (handle/submit → /classRoom).
 * The final URL is returned in `res.url`; the plugin uses it to tell success from failure.
 */
async function bdkjFetch(req: RequestOptions): Promise<CampusResponse> {
  let url = req.url;
  let res = await campusFetch(SESSION, { ...req, url, followRedirects: false, headers: { ...BDKJ_HEADERS, ...req.headers } });
  for (let hop = 0; hop < 10 && res.status >= 300 && res.status < 400 && res.location; hop++) {
    url = resolveUrl(res.location, url).replace(/^http:\/\/bdkj\.pku\.edu\.cn/i, BDKJ_BASE);
    if (__DEV__) console.log('[bdkj] →', res.status, url.split('?')[0]);
    res = await campusFetch(SESSION, { url, followRedirects: false, headers: BDKJ_HEADERS });
  }
  return { ...res, url };
}

let signingIn: Promise<void> | null = null;

async function login() {
  const { username, password } = await credentials();
  const token = await iaaaSignIn(BDKJ_APP, username, password, serviceName('bdkj'));
  await resetSession(SESSION);
  // Same shape as IAAA's own redirect: /login/oauth?_rand=…&token=… → 302 → /home.
  const cb = await bdkjFetch({ url: `${BDKJ_BASE}/login/oauth?_rand=${Math.random()}&token=${encodeURIComponent(token)}` });
  if (cb.status >= 400) throw new Error(t('app.campus.errors.signInHttp', { service: serviceName('bdkj'), status: cb.status }));
  if (loggedOut(cb)) throw new Error(t('app.campus.errors.rejected', { service: serviceName('bdkj') }));
  if (__DEV__) console.log('[bdkj] signed in →', cb.url.split('?')[0]);
}

/** One sign-in at a time; concurrent requests wait for it. */
function signIn() {
  signingIn ??= login().finally(() => {
    signingIn = null;
  });
  return signingIn;
}

/**
 * A lost session ends on IAAA, on bdkj's /oauth login entry, on its /login pages (except the
 * /login/oauth callback itself), or on the IAAA redirect page.
 */
function loggedOut(res: CampusResponse) {
  const path = /^https?:\/\/[^/]+([^?#]*)/.exec(res.url)?.[1] ?? '';
  return (
    res.status === 401 ||
    res.url.includes('iaaa.pku.edu.cn') ||
    path === '/oauth' ||
    path.startsWith('/oauth/') ||
    (path.startsWith('/login') && !path.startsWith('/login/oauth')) ||
    (res.body.includes('iaaa.pku.edu.cn') && res.body.includes('oauth.jsp'))
  );
}

async function request(req: RequestOptions, retried = false): Promise<CampusResponse> {
  // Persisted cookies are tried first after launch; a lost session signs in again once.
  if (signingIn) await signingIn;
  const res = await bdkjFetch({ ...req, url: req.url.startsWith('http') ? req.url : `${BDKJ_BASE}${req.url}` });
  if (!retried && loggedOut(res)) {
    await signIn();
    return request(req, true);
  }
  if (retried && loggedOut(res)) throw new Error(t('app.campus.errors.sessionLost', { service: serviceName('bdkj') }));
  return res;
}

registerCampusService('bdkj', {
  request: (req) => request(req),
  async reset() {
    await resetSession(SESSION);
  },
});
