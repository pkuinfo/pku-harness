import * as Crypto from 'expo-crypto';

import { APP_HEADERS, campusFetch, form, FORM } from './http';
import { encryptPkcs1 } from './rsa';

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

export async function iaaaLogin(app: IaaaApp, username: string, password: string, otpCode?: string): Promise<string> {
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
      smsCode: '',
      otpCode: otpCode ?? '',
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
