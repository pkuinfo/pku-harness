import { useEffect, useState, useSyncExternalStore } from 'react';

import { secrets } from '@/core/store/secrets';
import { t } from '@/i18n';

import { credentials } from './credentials';
import { campusFetch, form, FORM, resetSession } from './http';
import { totp } from './totp';

/**
 * IAAA 手机令牌 (TOTP authenticator) held by the harness, ported from pkucli
 * crates/common/src/otp.rs: two-step binding (`bind_otp_send_sms` → `bind_otp_verify`), the
 * secret saved locally, and `generate_totp`. The secret lives only in SecureStore
 * ('campus.otpSecret') and a memory copy; callers outside this file get codes, never the secret.
 *
 * Binding protocol (all under https://iaaa.pku.edu.cn/iaaa, one cookie jar across steps):
 *   1. POST auth4Bind.do                                   userName, password, randCode=""
 *   2. GET  pageFlows/identity/otpBind/sendSMSCodeBind.do?_rand  → { success, mobileMask }
 *   3. POST pageFlows/identity/otpBind/checkSms.do         userId=<student id>, smsCode
 *   4. GET  pageFlows/identity/otpBind/genOtpKey.do?_rand        → { personId, personName, secKey }
 *   5. POST pageFlows/identity/otpBind/userBind.do         userId=personId, otpCode=TOTP(secKey)
 */

const IAAA_BASE = 'https://iaaa.pku.edu.cn/iaaa';
const OTP_BASE = `${IAAA_BASE}/pageFlows/identity/otpBind`;
/**
 * Own cookie jar for the bind flow (pkucli also uses a fresh cookie store per bind): the
 * login jar ('iaaa') is reset by background sign-ins, which would drop the bind session
 * between "send SMS" and "verify".
 */
const BIND_SESSION = 'iaaa-otpbind';

type Saved = { secret: string; userId: string; userName: string; /** IAAA username the secret belongs to. */ username: string; boundAt: number };

export type OtpStatus = { bound: boolean; userId: string | null; userName: string | null; boundAt: number | null; /** A binding SMS was sent and awaits the code. */ pending: boolean };

let saved: Saved | null = null;
let loaded: Promise<void> | null = null;
let pendingUser: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load(): Promise<void> {
  loaded ??= secrets
    .get('campus.otpSecret')
    .then((raw) => {
      saved = raw ? (JSON.parse(raw) as Saved) : null;
    })
    .catch(() => {
      saved = null;
    })
    .finally(emit);
  return loaded;
}
void load();

const snapshot = (): OtpStatus => ({
  bound: !!saved,
  userId: saved?.userId ?? null,
  userName: saved?.userName ?? null,
  boundAt: saved?.boundAt ?? null,
  pending: pendingUser != null,
});
let cached = snapshot();
listeners.add(() => {
  cached = snapshot();
});

export async function otpStatus(): Promise<OtpStatus> {
  await load();
  return snapshot();
}

export function useOtpStatus(): OtpStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => cached,
  );
}

/**
 * The current code, or null when no secret is stored (or it belongs to another account than
 * `forUser`). Synchronous: reads the memory copy loaded at startup.
 */
export function currentCode(forUser?: string, nowMs = Date.now()): { code: string; remainingSeconds: number } | null {
  if (!saved) return null;
  if (forUser && saved.username !== forUser) return null;
  try {
    return totp(saved.secret, nowMs);
  } catch {
    return null;
  }
}

/** `currentCode` after the stored secret has loaded (for async callers right after launch). */
export async function currentCodeAsync(forUser?: string) {
  await load();
  return currentCode(forUser);
}

/** The current code, refreshed every second (null when not bound). */
export function useOtpCode(): { code: string; remainingSeconds: number } | null {
  useOtpStatus();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return currentCode();
}

function json<T>(body: string, step: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(t('app.campus.errors.badResponse', { step }));
  }
}

/**
 * Steps 1–2 (pkucli `auth_and_send_sms`): verify the stored credentials with auth4Bind and send
 * the binding SMS to the account's phone. Returns the masked number.
 */
export async function bindStart(): Promise<{ sentTo: string | null }> {
  const { username, password } = await credentials();
  await resetSession(BIND_SESSION);
  pendingUser = null;
  emit();

  const auth = await campusFetch(BIND_SESSION, {
    url: `${IAAA_BASE}/auth4Bind.do`,
    method: 'POST',
    contentType: FORM,
    body: form({ userName: username, password, randCode: '' }),
  });
  const a = json<{ success?: boolean; errors?: { msg?: string } }>(auth.body, '验证身份');
  if (!a.success) throw new Error(t('app.campus.otp.authFailed', { reason: a.errors?.msg || t('app.campus.otp.unknownError') }));

  const sms = await campusFetch(BIND_SESSION, { url: `${OTP_BASE}/sendSMSCodeBind.do?_rand=${Math.random()}` });
  const s = json<{ success?: boolean; mobileMask?: string; errMsg?: string }>(sms.body, '发送短信');
  if (!s.success) throw new Error(t('app.campus.otp.smsFailed', { reason: s.errMsg || t('app.campus.otp.unknownError') }));

  pendingUser = username;
  emit();
  return { sentTo: s.mobileMask || null };
}

/**
 * Steps 3–5 (pkucli `verify_sms_and_finalize`). Unlike pkucli, the secret is saved *before*
 * userBind.do so a crash between "IAAA bound it" and "we saved it" can't leave the account
 * bound to a key nobody has; it is removed again if userBind fails. On failure the bind
 * session is kept so the user can retry with a new code (as pkucli does).
 */
export async function bindFinish(smsCode: string): Promise<OtpStatus> {
  const code = smsCode.trim();
  if (!/^\d{4,8}$/.test(code)) throw new Error(t('app.campus.otp.enterCode'));
  const username = pendingUser;
  if (!username) throw new Error(t('app.campus.otp.sendFirst'));

  const check = await campusFetch(BIND_SESSION, {
    url: `${OTP_BASE}/checkSms.do`,
    method: 'POST',
    contentType: FORM,
    body: form({ userId: username, smsCode: code }),
  });
  const c = json<{ success?: boolean; message?: string }>(check.body, '验证短信码');
  if (!c.success) throw new Error(t('app.campus.otp.smsCheckFailed', { reason: c.message || t('app.campus.otp.wrongCode') }));

  const gen = await campusFetch(BIND_SESSION, { url: `${OTP_BASE}/genOtpKey.do?_rand=${Math.random()}` });
  const g = json<{ success?: boolean; personId?: string; personName?: string; secKey?: string; errMsg?: string }>(gen.body, '获取令牌密钥');
  if (!g.success) throw new Error(t('app.campus.otp.keyFailed', { reason: g.errMsg || t('app.campus.otp.sessionExpired') }));
  if (!g.personId || !g.secKey) throw new Error(t('app.campus.otp.keyFailed', { reason: 'personId / secKey' }));

  const next: Saved = { secret: g.secKey, userId: g.personId, userName: g.personName ?? '', username, boundAt: Date.now() };
  // Validates the key (Base32) before anything is stored.
  let otp = totp(next.secret);
  // A code that expires in flight would make userBind fail; use the next one.
  if (otp.remainingSeconds < 3) {
    await new Promise((r) => setTimeout(r, otp.remainingSeconds * 1000 + 200));
    otp = totp(next.secret);
  }
  const previous = saved;
  await secrets.set('campus.otpSecret', JSON.stringify(next));

  try {
    const bind = await campusFetch(BIND_SESSION, {
      url: `${OTP_BASE}/userBind.do`,
      method: 'POST',
      contentType: FORM,
      body: form({ userId: next.userId, otpCode: otp.code }),
    });
    const b = json<{ success?: boolean; errMsg?: string }>(bind.body, '完成绑定');
    if (!b.success) throw new Error(t('app.campus.otp.bindFailed', { reason: b.errMsg || t('app.campus.otp.unknownError') }));
  } catch (e) {
    if (previous) await secrets.set('campus.otpSecret', JSON.stringify(previous));
    else await secrets.delete('campus.otpSecret');
    throw e;
  }

  saved = next;
  pendingUser = null;
  await resetSession(BIND_SESSION);
  emit();
  return snapshot();
}

/**
 * Forget the secret on this device. IAAA still has the binding: logins that ask for a 手机令牌
 * then need a code from elsewhere, or a new binding (SMS) here.
 */
export async function unbindLocal(): Promise<void> {
  await secrets.delete('campus.otpSecret');
  saved = null;
  pendingUser = null;
  await resetSession(BIND_SESSION);
  emit();
}
