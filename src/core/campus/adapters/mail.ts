import * as Crypto from 'expo-crypto';

import { registerCampusService, serviceName } from '../account';
import { credentials } from '../credentials';
import { campusFetch, cookieValue, form, FORM, resetSession, type CampusResponse, type RequestOptions } from '../http';
import { encryptPkcs1Hex } from '../rsa';
import { askVerification } from '../verify';

import { loginStep } from './mail-step';

import { secrets } from '@/core/store/secrets';
import { t } from '@/i18n';

/**
 * 学生邮箱 (@stu.pku.edu.cn): NetEase Enterprise Mail behind the branded mail.stu.pku.edu.cn login.
 * Protocol captured from the web client (pkucli docs/stu-mail-api.md). Same student ID and
 * password as IAAA, but the mail server checks them itself (no IAAA token):
 *   1. GET mailh.qiye.163.com/login/prelogin.jsp?uid=<id>@stu.pku.edu.cn → RSA key {modulus, exponent, rand, pubid}
 *   2. POST /login/domainEntLogin, password = hex RSA(password#rand), passtype=3 → 302
 *   3. When the Location is the SMS page: send_code.jsp, ask the user, POST /login/mobileLogin with
 *      pass_2fa=1 (trust this device, so later logins skip the SMS; the device cookies last 30 days)
 *   4. The final Location carries `sid` and the mail host (e.g. mailshz.qiye.163.com).
 * Plugins call `/js6/s?func=…&sid={sid}` (and the contacts REST paths) on that host; the adapter
 * fills in `{sid}` and `{account}` (canonical address, for compose) so the plugin never holds them.
 */

const MAIL = 'mail';
const ENTRY = 'https://mailh.qiye.163.com';
const DOMAIN = 'stu.pku.edu.cn';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
const HEADERS = { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' };
const SESSION_SECRET = 'campus.mail.session' as const;
const DEVICE_SECRET = 'campus.mail.device' as const;

type MailSession = { sid: string; host: string; account: string };

let session: MailSession | null = null;
let loaded = false;
let signingIn: Promise<MailSession> | null = null;

async function loadSession() {
  if (!loaded) {
    loaded = true;
    try {
      const raw = await secrets.get(SESSION_SECRET);
      session = raw ? (JSON.parse(raw) as MailSession) : null;
    } catch {
      session = null;
    }
  }
  return session;
}

/** A stable per-install device id: the server trusts it after one SMS (pass_2fa=1). */
async function deviceId() {
  const saved = await secrets.get(DEVICE_SECRET).catch(() => null);
  if (saved) return saved;
  const id = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
  await secrets.set(DEVICE_SECRET, id).catch(() => {});
  return id;
}

async function preKey(id: string) {
  const res = await campusFetch(MAIL, { url: `${ENTRY}/login/prelogin.jsp?uid=${encodeURIComponent(`${id}@${DOMAIN}`)}`, headers: HEADERS });
  let j: { code?: number; data?: { modulus?: string; exponent?: string; rand?: string; pubid?: string; locked?: boolean; verify_code?: boolean } };
  try {
    j = JSON.parse(res.body.replace(/^[^(]*\(|\)\s*;?\s*$/g, ''));
  } catch {
    throw new Error(t('app.campus.errors.signInHttp', { service: serviceName('mail'), status: res.status }));
  }
  const d = j.data;
  if (d?.locked) throw new Error('邮箱账号已被锁定，请稍后再试或在网页上处理');
  if (d?.verify_code) throw new Error('邮箱登录需要图形验证码：请先在 mail.stu.pku.edu.cn 网页登录一次，再回来重试');
  if (!d?.modulus || !d.exponent || !d.rand || !d.pubid) throw new Error(t('app.campus.errors.signInHttp', { service: serviceName('mail'), status: res.status }));
  return d as { modulus: string; exponent: string; rand: string; pubid: string };
}

async function sendSmsCode(account: string, mobile: string) {
  const res = await campusFetch(MAIL, {
    url: `${ENTRY}/login/sms/send_code.jsp?r=${Math.random()}&domain=${DOMAIN}&account_name=${encodeURIComponent(account)}`,
    headers: { ...HEADERS, 'x-requested-with': 'XMLHttpRequest' },
  });
  if (res.body.trim() !== '0') throw new Error('短信验证码发送失败（可能发送太频繁），请稍后再试');
  return mobile;
}

async function login(): Promise<MailSession> {
  const { username, password } = await credentials();
  await resetSession(MAIL).catch(() => {});
  const device = await deviceId();
  const key = await preKey(username);
  const encrypted = encryptPkcs1Hex(key.modulus, key.exponent, `${password}#${key.rand}`, (n) => Crypto.getRandomBytes(n));
  const res = await campusFetch(MAIL, {
    url: `${ENTRY}/login/domainEntLogin`,
    method: 'POST',
    followRedirects: false,
    headers: { ...HEADERS, 'content-type': FORM, origin: 'https://mail.stu.pku.edu.cn', referer: 'https://mail.stu.pku.edu.cn/' },
    body: form({ pubid: key.pubid, passtype: '3', support_verify_code: '1', domain: DOMAIN, account_name: username, password: encrypted, verify_code: '', secure: '1', all_secure: '1', ch: '', _deviceId: device }),
  });
  let step = loginStep(res.location);
  if (step.kind === 'sms') {
    const { account, mobile, url } = step;
    const sentTo = await sendSmsCode(account, mobile);
    const code = await askVerification({ mode: 'sms', sentTo, service: serviceName('mail'), resend: () => sendSmsCode(account, mobile) });
    if (!code) throw new Error(t('app.campus.errors.cancelled'));
    const done = await campusFetch(MAIL, {
      url: `${ENTRY}/login/mobileLogin${url.slice(url.indexOf('?'))}`,
      method: 'POST',
      followRedirects: false,
      headers: { ...HEADERS, 'content-type': FORM, origin: ENTRY, referer: url },
      body: form({ domain: DOMAIN, account_name: account, _version: '', autoEntry: 'true', code: code.trim(), pass_2fa: '1', p: '' }),
    });
    step = loginStep(done.location);
    if (step.kind === 'sms') throw new Error('短信验证码不对或已过期，请重新登录');
  }
  if (step.kind !== 'done') throw new Error(t('app.campus.errors.wrongPassword'));
  const uid = cookieValue(MAIL, `https://${step.host}/`, 'qiye_uid')?.replace(/^"|"$/g, '') || `${username}@${DOMAIN}`;
  session = { sid: step.sid, host: step.host, account: uid };
  await secrets.set(SESSION_SECRET, JSON.stringify(session)).catch(() => {});
  return session;
}

function signIn() {
  signingIn ??= login().finally(() => {
    signingIn = null;
  });
  return signingIn;
}

/** A js6 answer that means the session is gone (sign in again). */
function sessionLost(res: CampusResponse) {
  if (res.status === 401 || (res.status >= 300 && res.status < 400)) return true;
  return /"code"\s*:\s*"FA_(INVALID_SESSION|SESSION_TIMEOUT|NEED_LOGIN|SECURITY)"/.test(res.body.slice(0, 200));
}

const MARKS = { sid: /\{sid\}|%7Bsid%7D/gi, account: /\{account\}|%7Baccount%7D/gi };

async function mailRequest(req: RequestOptions, retried = false): Promise<CampusResponse> {
  const s = (signingIn ? await signingIn : await loadSession()) ?? (await signIn());
  const raw = req.url.startsWith('http') ? req.url : `https://${s.host}${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  // The session host may change between sign-ins: plugins write paths, or any *.qiye.163.com URL.
  const url = raw.replace(/^https:\/\/[a-z0-9.-]+\.qiye\.163\.com\//i, `https://${s.host}/`);
  if (!url.startsWith(`https://${s.host}/`)) throw new Error('mail 服务只接受邮箱服务器 (*.qiye.163.com) 的地址');
  const res = await campusFetch(MAIL, {
    ...req,
    url: url.replace(MARKS.sid, encodeURIComponent(s.sid)).replace(MARKS.account, encodeURIComponent(s.account)),
    body: req.body?.replace(MARKS.sid, s.sid).replace(MARKS.account, s.account),
    followRedirects: false,
    headers: { ...HEADERS, accept: 'application/json, text/plain, */*', origin: `https://${s.host}`, ...req.headers },
  });
  if (sessionLost(res)) {
    session = null;
    await secrets.delete(SESSION_SECRET).catch(() => {});
    if (retried) throw new Error(t('app.campus.errors.sessionLost', { service: serviceName('mail') }));
    await signIn();
    return mailRequest(req, true);
  }
  return { ...res, url: res.url.split(s.sid).join('{sid}') };
}

registerCampusService(MAIL, {
  request: (req) => mailRequest(req),
  async reset() {
    session = null;
    loaded = true;
    await secrets.delete(SESSION_SECRET).catch(() => {});
    await resetSession(MAIL);
  },
});
