import { t } from '@/i18n';

import { credentials, registerCampusService, serviceName } from '../account';
import { campusFetch, resetSession, type CampusResponse, type RequestOptions } from '../http';
import { iaaaSignIn, type IaaaApp } from '../iaaa';

/**
 * 选课网 (elective.pku.edu.cn), service id `elective`. Ported from pkucli crates/elective:
 * - client.rs: desktop browser UA, manual redirects; the IAAA redirect is the plain-HTTP :80 URL.
 * - login.rs `iaaa_config`: IAAA app id is "syllabus" (not "elective", whatever the docs say).
 * - login.rs `complete_sso_login`: GET ssoLogin.do?_rand=…&token=… → 3xx chain (follow it), or
 *   HTTP 200. A dual-degree account gets a chooser page (div1/div2) with links
 *   `?sida=<32 chars>&sttp=bzx|bfx`; GET that (主修 bzx / 辅双 bfx) and follow its redirects.
 * - api.rs `follow_and_read`: a lost session redirects to iaaa/login, answers 401, or shows an
 *   IAAA login page; sign in again once.
 *
 * Dual degree: the site shows one program per session. A plugin picks it with the request header
 * `x-elective-program: major | minor` (stripped before sending); a different choice re-logs in.
 * Every response carries `x-elective-program: single | major | minor` so the plugin can tell
 * which program it is looking at. Electing / dropping is deliberately not supported anywhere.
 */

const BASE = 'https://elective.pku.edu.cn';
const SSO_LOGIN = `${BASE}/elective2008/ssoLogin.do`;
const APP: IaaaApp = { appId: 'syllabus', redirectUrl: 'http://elective.pku.edu.cn:80/elective2008/ssoLogin.do' };
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};
const PROGRAM_HEADER = 'x-elective-program';

type Program = 'major' | 'minor';
/** null = signed out; 'single' = not a dual-degree account. */
let current: Program | 'single' | null = null;

const resolveUrl = (location: string, base: string) => {
  if (/^https?:\/\//i.test(location)) return location;
  const origin = /^https?:\/\/[^/]+/i.exec(base)?.[0] ?? '';
  return location.startsWith('/') ? origin + location : base.replace(/[^/]*([?#].*)?$/, '') + location;
};

/** api.rs follow_and_read: a redirect towards iaaa / a login page means the session is gone. */
const toLogin = (location: string) => location.includes('iaaa') || location.includes('login');

/** Follow up to 5 redirects (login.rs follow_redirects / api.rs follow_and_read), stopping at a login hop. */
async function electiveFetch(req: RequestOptions): Promise<CampusResponse & { lost?: boolean }> {
  let url = req.url;
  let res = await campusFetch('elective', { ...req, followRedirects: false, headers: { ...HEADERS, ...req.headers } });
  for (let hop = 0; hop < 5 && res.status >= 300 && res.status < 400 && res.location; hop++) {
    if (toLogin(res.location)) return { ...res, lost: true };
    url = resolveUrl(res.location, url);
    if (__DEV__) console.log('[elective] →', res.status, url.split('?')[0]);
    res = await campusFetch('elective', { url, followRedirects: false, headers: HEADERS });
  }
  return res;
}

/** login.rs extract_sida: `?sida=<32 non-space chars>&sttp=` on the dual-degree chooser. */
const sidaOf = (body: string) => /\?sida=(\S{32})&sttp=/.exec(body)?.[1] ?? null;

async function login(program: Program | undefined) {
  const { username, password } = await credentials();
  await resetSession('iaaa');
  const token = await iaaaSignIn(APP, username, password, serviceName('elective'));
  await resetSession('elective');
  current = null;
  const sso = await electiveFetch({ url: `${SSO_LOGIN}?_rand=${Math.random()}&token=${encodeURIComponent(token)}` });
  if (sso.status >= 400) throw new Error(t('app.campus.errors.signInHttp', { service: serviceName('elective'), status: sso.status }));
  const sida = sso.status === 200 ? sidaOf(sso.body) : null;
  if (sida || (sso.status === 200 && sso.body.includes('div1') && sso.body.includes('div2'))) {
    // Dual degree: pkucli insists on --dual; here the plugin may choose, default 主修.
    if (!sida) throw new Error(t('app.campus.errors.electiveDualDegree'));
    const pick = program ?? 'major';
    const chosen = await electiveFetch({ url: `${SSO_LOGIN}?sida=${sida}&sttp=${pick === 'major' ? 'bzx' : 'bfx'}` });
    if (chosen.status >= 400) throw new Error(t('app.campus.errors.signInHttp', { service: serviceName('elective'), status: chosen.status }));
    current = pick;
  } else {
    current = 'single';
  }
}

function loggedOut(res: CampusResponse & { lost?: boolean }) {
  if (res.lost || res.status === 401) return true;
  const path = /^https?:\/\/[^/]+([^?#]*)/.exec(res.url)?.[1] ?? '';
  // api.rs: an IAAA login page in the body. The timeout page ("您尚未登录或者会话超时") too.
  return path.includes('iaaa') || (res.body.includes('IAAA') && res.body.includes('login')) || /尚未登录|会话超时/.test(res.body.slice(0, 4000));
}

async function request(req: RequestOptions, retried = false): Promise<CampusResponse> {
  const { [PROGRAM_HEADER]: wanted, ...headers } = req.headers ?? {};
  const program = wanted === 'major' || wanted === 'minor' ? (wanted as Program) : undefined;
  // A different program on a dual-degree account needs a fresh SSO login.
  if (current == null || (program && current !== 'single' && current !== program)) await login(program);
  const res = await electiveFetch({ ...req, headers, url: req.url.startsWith('http') ? req.url : `${BASE}${req.url}` });
  if (!retried && loggedOut(res)) {
    current = null;
    return request(req, true);
  }
  if (loggedOut(res)) throw new Error(t('app.campus.errors.electiveSession'));
  const { lost: _lost, ...out } = res;
  return { ...out, headers: { ...out.headers, [PROGRAM_HEADER]: current ?? 'single' } };
}

registerCampusService('elective', {
  request,
  async reset() {
    current = null;
    await resetSession('elective');
  },
});
