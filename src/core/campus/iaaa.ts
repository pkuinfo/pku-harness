import * as Crypto from 'expo-crypto';

import { APP_HEADERS, campusFetch, form, FORM } from './http';
import { encryptPkcs1 } from './rsa';
import { askVerification } from './verify';

/**
 * IAAA (统一身份认证) password login, ported from pkucli crates/common/src/iaaa.rs
 * `login_password`: fetch the RSA public key, encrypt the password, POST oauthlogin.do; the
 * returned token is redeemed by each service's own SSO callback.
 */

const IAAA_BASE = 'https://iaaa.pku.edu.cn/iaaa';

export type IaaaApp = { appId: string; redirectUrl: string };

/** The portal app is the entry to the campus card (pkucli crates/campuscard/src/login.rs). */
export const PORTAL_APP: IaaaApp = { appId: 'portal2017', redirectUrl: 'https://portal.pku.edu.cn/portal2017/ssoLogin.do' };

export class IaaaError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Codes pkucli documents; anything else shows IAAA's own message (it is already Chinese). */
const FRIENDLY: Record<string, string> = { E02: '账号需要先激活' };

/**
 * What second factor IAAA wants for this account + app (OAuthLogin.js `showOrHideSmsCode`:
 * GET isMobileAuthen.do → isMobileAuthen, authenMode "OTP" | "SMS", isBind, emailSuitable).
 */
export async function iaaaPrecheck(app: IaaaApp, username: string): Promise<{ mode: 'none' | 'sms' | 'email' | 'otp'; otpBound: boolean }> {
  const res = await campusFetch('iaaa', {
    url: `${IAAA_BASE}/isMobileAuthen.do?userName=${encodeURIComponent(username)}&appId=${encodeURIComponent(app.appId)}&_rand=${Math.random()}`,
    headers: { ...APP_HEADERS, 'x-requested-with': 'XMLHttpRequest', referer: `${IAAA_BASE}/oauth.jsp` },
  });
  const j = parseJson<{ success?: boolean; isMobileAuthen?: boolean; authenMode?: string; isBind?: boolean; emailSuitable?: boolean }>(res.body, '登录前检查');
  if (!j.success || !j.isMobileAuthen) return { mode: 'none', otpBound: true };
  if (j.authenMode === 'OTP') return { mode: 'otp', otpBound: j.isBind !== false };
  return { mode: j.emailSuitable ? 'email' : 'sms', otpBound: true };
}

/** Send the SMS/email code (OAuthLogin.js `sendSMSCode`); returns the masked destination. */
export async function iaaaSendCode(app: IaaaApp, username: string): Promise<string | undefined> {
  const res = await campusFetch('iaaa', {
    url: `${IAAA_BASE}/sendSMSCode.do?userName=${encodeURIComponent(username)}&appId=${encodeURIComponent(app.appId)}&_rand=${Math.random()}`,
    headers: { ...APP_HEADERS, 'x-requested-with': 'XMLHttpRequest', referer: `${IAAA_BASE}/oauth.jsp` },
  });
  const j = parseJson<{ success?: boolean; mobileMask?: string; message?: string }>(res.body, '发送验证码');
  if (!j.success) throw new IaaaError(j.message || '验证码发送失败', 'SMS_FAILED');
  return j.mobileMask;
}

/**
 * Sign in to an IAAA app, adapting to the account's second factor: when IAAA wants an SMS,
 * email or 手机令牌 code, send it (SMS/email) and ask the user through the verification prompt.
 */
export async function iaaaSignIn(app: IaaaApp, username: string, password: string, service: string): Promise<string> {
  const check = await iaaaPrecheck(app, username).catch(() => ({ mode: 'none' as const, otpBound: true }));
  if (check.mode === 'none') return iaaaLogin(app, username, password);
  if (check.mode === 'otp' && !check.otpBound) throw new IaaaError('账号要求手机令牌，但还没有绑定。请先在 iaaa.pku.edu.cn 绑定手机 App', 'OTP_UNBOUND');
  const sentTo = check.mode === 'otp' ? undefined : await iaaaSendCode(app, username);
  const code = await askVerification({
    mode: check.mode,
    sentTo,
    service,
    resend: check.mode === 'otp' ? undefined : () => iaaaSendCode(app, username),
  });
  if (!code) throw new IaaaError('已取消验证', 'CANCELLED');
  return check.mode === 'otp' ? iaaaLogin(app, username, password, { otp: code }) : iaaaLogin(app, username, password, { sms: code });
}

export async function iaaaLogin(app: IaaaApp, username: string, password: string, codes: { otp?: string; sms?: string } = {}): Promise<string> {
  const keyRes = await campusFetch('iaaa', {
    url: `${IAAA_BASE}/getPublicKey.do`,
    headers: { ...APP_HEADERS, 'x-requested-with': 'XMLHttpRequest', referer: `${IAAA_BASE}/oauth.jsp` },
  });
  const key = parseJson<{ success: boolean; key?: string }>(keyRes.body, '获取公钥');
  if (!key.success || !key.key) throw new IaaaError('获取 IAAA 公钥失败', 'NO_KEY');

  const encrypted = encryptPkcs1(key.key, password, (n) => Crypto.getRandomBytes(n));
  const res = await campusFetch('iaaa', {
    url: `${IAAA_BASE}/oauthlogin.do`,
    method: 'POST',
    contentType: FORM,
    headers: { 'x-requested-with': 'XMLHttpRequest', referer: `${IAAA_BASE}/oauth.jsp` },
    body: form({
      appid: app.appId,
      userName: username,
      password: encrypted,
      randCode: '',
      smsCode: codes.sms ?? '',
      otpCode: codes.otp ?? '',
      redirUrl: app.redirectUrl,
    }),
  });
  const out = parseJson<{ success: boolean; token?: string; errors?: { code?: string; msg?: string } }>(res.body, '登录');
  if (out.success && out.token) return out.token;
  const code = out.errors?.code ?? 'UNKNOWN';
  const msg = out.errors?.msg ?? '';
  // IAAA answers wrong credentials with this English text (seen on device, 2026-10-18).
  const translated = /not correct/i.test(msg) ? '学号或密码错误' : undefined;
  throw new IaaaError(FRIENDLY[code] ?? translated ?? (msg || 'IAAA 登录失败'), code);
}

function parseJson<T>(body: string, step: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new IaaaError(`${step}响应无法解析（可能需要校园网或服务暂时不可用）`, 'BAD_RESPONSE');
  }
}
