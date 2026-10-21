import { credentials, registerCampusService } from '../account';
import { campusFetch, resetSession, type CampusResponse, type RequestOptions } from '../http';
import { iaaaSignIn, type IaaaApp } from '../iaaa';
import { decodeCwpayBody, envelopeState, parseDealcasLocation, parseEnvelope } from './cwpay-crypto';

/**
 * 北京大学收费平台 (cwpay.pku.edu.cn, "收费大厅", vendor datalook): 学费住宿费, 浴卡充值, 网费,
 * 校园卡充值, 订单记录 … Not in pkucli; protocol read from the live site's own bundles
 * (2026-10-21: /mobile/js/app.43b046a6.js + chunks, PC /static/js/app.33b8090b.js):
 *
 * 1. GET /api/pay/iaaa/getIAAALoginParam (public) → {appId "CWSF", redirectUrl
 *    "http://cwpay.pku.edu.cn/dealcas"}; IAAA as that app.
 * 2. GET https://cwpay.pku.edu.cn/dealcas/?_rand=…&token=<iaaa> → 302
 *    `/#/middle_page?token=<X-Token>&jsonData={idserial,…}` (PC MiddlePage), or
 *    `/#/middle_page_error?errorMsg=…` (seen live with a bad token).
 * 3. Every API call: `/api/<path>` with header `X-Token`. JSON answers are AES-encrypted
 *    (cwpay-crypto.ts); messageCode "-3" hands out a renewed token (replay), "-1"/"-2"/50014 =
 *    signed out (sign in again).
 *
 * Plugins call `services.campus.request('cwpay', { url: 'pay/web/…' })` and get the decrypted
 * JSON body. The X-Token never reaches a plugin's result: the one exception is the virtual
 * `handoff()` (services.campus.openSignedIn), which returns the mobile site's own token hand-off URL
 * (`/mobile/#/middle_page?token=…&domain_url_wap=…`, what the PC site does on phones) for the
 * plugin to pass straight to `services.browser.open` so the user can pay an order there.
 */

export const CWPAY_BASE = 'https://cwpay.pku.edu.cn';
const FALLBACK_APP: IaaaApp = { appId: 'CWSF', redirectUrl: 'http://cwpay.pku.edu.cn/dealcas' };
const HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9',
  referer: `${CWPAY_BASE}/mobile/`,
};

let token: string | null = null;
let jsonData: string | null = null;
let signingIn: Promise<void> | null = null;

const resolve = (url: string) => {
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.replace(/^\/+/, '').replace(/^api\//, '');
  return `${CWPAY_BASE}/api/${path}`;
};

/** login step 1: the IAAA app the site itself asks for (constants as fallback). */
async function iaaaApp(): Promise<IaaaApp> {
  try {
    const res = await campusFetch('cwpay', { url: resolve('pay/iaaa/getIAAALoginParam'), headers: HEADERS });
    const data = parseEnvelope(decodeCwpayBody(res.body))?.data as { appId?: string; redirectUrl?: string } | undefined;
    if (data?.appId && data.redirectUrl) return { appId: data.appId, redirectUrl: data.redirectUrl };
  } catch {
    // fall back
  }
  return FALLBACK_APP;
}

async function login() {
  const { username, password } = await credentials();
  await resetSession('iaaa');
  await resetSession('cwpay');
  const app = await iaaaApp();
  const iaaaToken = await iaaaSignIn(app, username, password, '收费平台');

  // http://…/dealcas → https://…/dealcas → https://…/dealcas/ → /#/middle_page…
  let url = `${app.redirectUrl}?_rand=${Math.random()}&token=${encodeURIComponent(iaaaToken)}`.replace(/^http:\/\//i, 'https://');
  for (let hop = 0; hop < 6; hop++) {
    const res = await campusFetch('cwpay', { url, followRedirects: false, headers: { ...HEADERS, accept: 'text/html,*/*' } });
    const loc = res.location;
    if (!loc || res.status < 300 || res.status >= 400) throw new Error(`收费平台登录失败（HTTP ${res.status}）`);
    const abs = /^https?:\/\//i.test(loc) ? loc : `${CWPAY_BASE}${loc.startsWith('/') ? '' : '/'}${loc}`;
    const result = parseDealcasLocation(abs);
    if (result?.ok) {
      token = result.token;
      jsonData = result.jsonData;
      if (__DEV__) console.log('[cwpay] signed in');
      return;
    }
    if (result && !result.ok) throw new Error(`收费平台登录失败：${result.error}`);
    url = abs.replace(/^http:\/\//i, 'https://');
  }
  throw new Error('收费平台登录跳转过多');
}

function ensureLogin() {
  signingIn ??= login().finally(() => {
    signingIn = null;
  });
  return signingIn;
}

/** The mobile site's own hand-off (mobile chunk-2d0b5e54 `fromPc`): sets its token cookie, opens /home. */
function handoffUrl(username: string) {
  const data = jsonData ?? JSON.stringify({ idserial: username });
  return `${CWPAY_BASE}/mobile/#/middle_page?token=${encodeURIComponent(token ?? '')}&jsonData=${encodeURIComponent(data)}&domain_url_wap=${encodeURIComponent(`${CWPAY_BASE}/mobile`)}`;
}

async function request(req: RequestOptions, attempt = 0): Promise<CampusResponse> {
  if (!token) await ensureLogin();
  const res = await campusFetch('cwpay', {
    ...req,
    url: resolve(req.url),
    headers: { ...HEADERS, ...req.headers, 'X-Token': token ?? '' },
  });
  const body = decodeCwpayBody(res.body);
  const env = parseEnvelope(body);
  const state = envelopeState(env);
  if (attempt < 2 && state === 'renew' && typeof env?.data === 'string' && env.data) {
    token = env.data;
    return request(req, attempt + 1);
  }
  if (attempt < 1 && (res.status === 401 || state === 'signedOut')) {
    token = null;
    return request(req, attempt + 1);
  }
  return { ...res, body };
}

registerCampusService('cwpay', {
  request: (req) => request(req),
  // services.campus.openSignedIn('cwpay'): the host opens this; plugins never see the token.
  async handoff() {
    if (!token) await ensureLogin();
    const { username } = await credentials();
    return handoffUrl(username);
  },
  async reset() {
    token = null;
    jsonData = null;
    await resetSession('cwpay');
  },
});
