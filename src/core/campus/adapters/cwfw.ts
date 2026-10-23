import { t } from '@/i18n';

import { credentials, registerCampusService, serviceName } from '../account';
import { campusFetch, FORM, form, resetSession, type CampusResponse, type RequestOptions } from '../http';
import { iaaaSignIn, type IaaaApp } from '../iaaa';

/**
 * 财务综合信息门户 (cwfw.pku.edu.cn, Wingsoft "网上查询", subsystem WF_CWBS). Campus network only.
 *
 * pkucli crates/cwfw/src/login.rs `complete_login`, ported step by step (every hop is needed):
 * 1. IAAA as "IIPF" → GET /WFManager/home2.jsp?_rand=…&token=<iaaa token> (cross-subsystem cookies)
 * 2. POST /WFManager/findpages_postData.action {token, timeStamp} → "ok" (the page's own $.ajax;
 *    this is where the server really authenticates and initialises the WF_* sessions)
 * 3. GET /WFManager/home3.jsp → `<div id="WF_CWBS" url="WINOPEN../WF_CWBS/main2.jsp?…&token=…">`
 * 4. GET that entry (referer home3.jsp) → WF_CWBS session cookies
 * client.rs uses a desktop browser UA. Plugins get `request` on WF_CWBS paths; the request
 * body encryption and userContext stay in the finance plugin.
 */

export const CWFW_BASE = 'https://cwfw.pku.edu.cn';
const CWFW_APP: IaaaApp = { appId: 'IIPF', redirectUrl: `${CWFW_BASE}/WFManager/home2.jsp` };
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh,zh-CN;q=0.9',
};

let ready = false;
let signingIn: Promise<void> | null = null;

/** Any transport failure on this host means it isn't reachable: almost always off campus. */
async function fetchCwfw(req: RequestOptions): Promise<CampusResponse> {
  try {
    return await campusFetch('cwfw', { ...req, headers: { ...HEADERS, ...req.headers } });
  } catch (e) {
    if (__DEV__) console.log('[cwfw] network error', e instanceof Error ? e.message : e);
    throw new Error(t('app.campus.errors.offCampus'));
  }
}

/** login.rs `extract_wf_cwbs_entry`: the WF_CWBS tile's url, minus `WINOPEN`, entities decoded. */
function wfCwbsEntry(html: string) {
  const raw = /id="WF_CWBS"\s+url="([^"]+)"/.exec(html)?.[1];
  return raw ? raw.replace(/&amp;/g, '&').replace(/^WINOPEN/, '') : null;
}

/** login.rs `resolve_relative` against /WFManager/home3.jsp (RN's URL can't resolve `../`). */
function resolveEntry(entry: string) {
  if (/^https?:\/\//i.test(entry)) return entry;
  if (entry.startsWith('/')) return CWFW_BASE + entry;
  const dirs = ['WFManager'];
  let rest = entry;
  for (;;) {
    if (rest.startsWith('../')) dirs.pop();
    else if (!rest.startsWith('./')) break;
    rest = rest.slice(rest.indexOf('/') + 1);
  }
  return `${CWFW_BASE}/${[...dirs, rest].join('/')}`;
}

async function login() {
  const { username, password } = await credentials();
  const token = await iaaaSignIn(CWFW_APP, username, password, serviceName('cwfw'));
  await resetSession('cwfw');

  // 1. home2.jsp (redirects on to home3.jsp)
  const home = await fetchCwfw({ url: `${CWFW_APP.redirectUrl}?_rand=${Math.random()}&token=${encodeURIComponent(token)}`, followRedirects: true });
  if (home.status >= 400) throw new Error(t('app.campus.errors.signInHttp', { service: serviceName('cwfw'), status: `home2.jsp ${home.status}` }));
  if (home.body.includes('iaaa.pku.edu.cn') && home.body.includes('oauth.jsp')) throw new Error(t('app.campus.errors.cwfwRejected'));

  // 2. findpages_postData.action must answer exactly "ok"
  const post = await fetchCwfw({
    url: `${CWFW_BASE}/WFManager/findpages_postData.action`,
    method: 'POST',
    contentType: FORM,
    headers: { 'x-requested-with': 'XMLHttpRequest' },
    body: form({ token, timeStamp: String(Date.now()) }),
  });
  if (post.status >= 400) throw new Error(t('app.campus.errors.signInHttp', { service: serviceName('cwfw'), status: `findpages_postData ${post.status}` }));
  if (post.body.trim() !== 'ok') throw new Error(t('app.campus.errors.cwfwDisabled'));

  // 3. home3.jsp → WF_CWBS entry
  const home3 = await fetchCwfw({ url: `${CWFW_BASE}/WFManager/home3.jsp`, followRedirects: true });
  if (home3.status >= 400) throw new Error(t('app.campus.errors.signInHttp', { service: serviceName('cwfw'), status: `home3.jsp ${home3.status}` }));
  const entry = wfCwbsEntry(home3.body);
  if (!entry) throw new Error('财务门户主页里没有找到“网上查询”(WF_CWBS) 入口');

  // 4. the subsystem entry, relative to /WFManager/
  const main = await fetchCwfw({
    url: resolveEntry(entry),
    followRedirects: true,
    headers: { referer: `${CWFW_BASE}/WFManager/home3.jsp` },
  });
  if (main.status >= 400) throw new Error(t('app.campus.errors.signInHttp', { service: serviceName('cwfw'), status: main.status }));
  if (timedOut(main)) throw new Error(t('app.campus.errors.cwfwSession'));
  ready = true;
}

/** One sign-in at a time; parallel tool calls wait for it. */
function ensureLogin() {
  signingIn ??= login().finally(() => {
    signingIn = null;
  });
  return signingIn;
}

/** login.rs: a dead session shows the "系统超时" page pointing at login.html (or bounces to IAAA). */
function timedOut(res: CampusResponse) {
  if (res.url.includes('iaaa.pku.edu.cn')) return true;
  if (res.body.length > 8000) return false;
  return /login\.(html|jsp)/.test(res.body) && /系统超时|会话超时|重新登录/.test(res.body);
}

async function request(req: RequestOptions, retried = false): Promise<CampusResponse> {
  if (!ready) await ensureLogin();
  const res = await fetchCwfw({ followRedirects: true, ...req, url: req.url.startsWith('http') ? req.url : `${CWFW_BASE}${req.url}` });
  if (!retried && (res.status === 401 || timedOut(res))) {
    ready = false;
    return request(req, true);
  }
  return res;
}

registerCampusService('cwfw', {
  request: (req) => request(req),
  async reset() {
    ready = false;
    await resetSession('cwfw');
  },
});
