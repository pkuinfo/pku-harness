import { useSyncExternalStore } from 'react';

/**
 * Second-factor codes IAAA asks for (SMS, email or 手机令牌 OTP). Any campus login, including
 * background session refreshes, can need one; the root layout renders the prompt and the login
 * waits for the user's answer. Without the UI (headless background tasks) it fails clearly.
 */

export type VerificationRequest = {
  id: number;
  mode: 'sms' | 'email' | 'otp';
  /** Where the code went, e.g. "138****1234" (sms / email). */
  sentTo?: string;
  /** Which service is signing in, for the prompt. */
  service: string;
  /** Resend the SMS/email code (not for OTP). */
  resend?: () => Promise<string | undefined>;
};

let queue: VerificationRequest[] = [];
const resolvers = new Map<number, (code: string | null) => void>();
const listeners = new Set<() => void>();
let nextId = 1;
let uiReady = false;
const emit = () => listeners.forEach((l) => l());

export const verification = {
  current: () => queue[0] ?? null,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Answer the front request with a code, or null to cancel. */
  answer(id: number, code: string | null) {
    queue = queue.filter((r) => r.id !== id);
    emit();
    resolvers.get(id)?.(code);
    resolvers.delete(id);
  },
};

/** Called by the root layout once the prompt is mounted. */
export function installVerificationPrompt() {
  uiReady = true;
}

export class VerificationUnavailable extends Error {}

/** Ask the user for a code; resolves null if they cancel. */
export function askVerification(req: Omit<VerificationRequest, 'id'>): Promise<string | null> {
  if (!uiReady) return Promise.reject(new VerificationUnavailable('校园登录需要验证码，请打开 App 完成验证'));
  return new Promise((resolve) => {
    const id = nextId++;
    resolvers.set(id, resolve);
    queue = [...queue, { ...req, id }];
    emit();
  });
}

export function useVerificationRequest(): VerificationRequest | null {
  return useSyncExternalStore(verification.subscribe, verification.current);
}
