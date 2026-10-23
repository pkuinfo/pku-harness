import * as Crypto from 'expo-crypto';

import { t } from '@/i18n';

import { APP_HEADERS, campusFetch, form, FORM, resetSession } from './http';
import { currentCodeAsync } from './otp';
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

/** Codes pkucli documents; anything else shows IAAA's own message (always Chinese). */
const FRIENDLY: Record<string, () => string> = { E02: () => t('app.campus.errors.activate') };
/** Our code for wrong credentials (IAAA's own code for it varies). */
const WRONG_PASSWORD = 'WRONG_PASSWORD';

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
  if (!j.success) throw new IaaaError(j.message || t('app.campus.errors.sendCodeFailed'), 'SMS_FAILED');
  return j.mobileMask;
}

/**
 * Sign in to an IAAA app, adapting to the account's second factor: when IAAA wants an SMS,
 * email or 手机令牌 code, send it (SMS/email) and ask the user through the verification prompt.
 */
export function iaaaSignIn(app: IaaaApp, username: string, password: string, service: string): Promise<string> {
  // One IAAA flow at a time: every service signs in through the shared 'iaaa' jar, and two
  // overlapping sign-ins (the wallet loading the Campus Card and the bath card together) used to
  // reset it under each other ("No campus HTTP session 'iaaa'"). A verification prompt waiting
  // for the user holds the lock; later sign-ins queue behind it.
  const run = signInLock.then(
    () => signInLocked(app, username, password, service),
    () => signInLocked(app, username, password, service),
  );
  signInLock = run.catch(() => undefined);
  return run;
}

let signInLock: Promise<unknown> = Promise.resolve();

async function signInLocked(app: IaaaApp, username: string, password: string, service: string): Promise<string> {
  // A fresh jar for each sign-in (callers no longer reset it themselves, outside the lock).
  await resetSession('iaaa');
  const check = await iaaaPrecheck(app, username).catch(() => ({ mode: 'none' as const, otpBound: true }));
  if (check.mode === 'none') return iaaaLogin(app, username, password);
  if (check.mode === 'otp' && !check.otpBound) throw new IaaaError(t('app.campus.errors.otpUnbound'), 'OTP_UNBOUND');
  if (check.mode === 'otp') {
    // The harness's own authenticator (otp.ts): answer with its code instead of prompting.
    // Wait for the next code when this one is about to roll over; prompt if IAAA rejects it.
    let auto = await currentCodeAsync(username);
    if (auto && auto.remainingSeconds < 3) {
      const waitMs = auto.remainingSeconds * 1000 + 200;
      await new Promise((r) => setTimeout(r, waitMs));
      auto = await currentCodeAsync(username);
    }
    if (auto) {
      try {
        return await iaaaLogin(app, username, password, { otp: auto.code });
      } catch (e) {
        // Wrong password is not an OTP problem; anything else falls through to the prompt.
        if (e instanceof IaaaError && e.code === WRONG_PASSWORD) throw e;
      }
    }
  }
  const sentTo = check.mode === 'otp' ? undefined : await iaaaSendCode(app, username);
  const code = await askVerification({
    mode: check.mode,
    sentTo,
    service,
    resend: check.mode === 'otp' ? undefined : () => iaaaSendCode(app, username),
  });
  if (!code) throw new IaaaError(t('app.campus.errors.cancelled'), 'CANCELLED');
  return check.mode === 'otp' ? iaaaLogin(app, username, password, { otp: code }) : iaaaLogin(app, username, password, { sms: code });
}

export async function iaaaLogin(app: IaaaApp, username: string, password: string, codes: { otp?: string; sms?: string } = {}): Promise<string> {
  const keyRes = await campusFetch('iaaa', {
    url: `${IAAA_BASE}/getPublicKey.do`,
    headers: { ...APP_HEADERS, 'x-requested-with': 'XMLHttpRequest', referer: `${IAAA_BASE}/oauth.jsp` },
  });
  const key = parseJson<{ success: boolean; key?: string }>(keyRes.body, '获取公钥');
  if (!key.success || !key.key) throw new IaaaError(t('app.campus.errors.noPublicKey'), 'NO_KEY');

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
  if (/not correct/i.test(msg)) throw new IaaaError(t('app.campus.errors.wrongPassword'), WRONG_PASSWORD);
  throw new IaaaError(FRIENDLY[code]?.() ?? (msg || t('app.campus.errors.iaaaFailed')), code);
}

function parseJson<T>(body: string, step: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new IaaaError(t('app.campus.errors.badResponse', { step }), 'BAD_RESPONSE');
  }
}
