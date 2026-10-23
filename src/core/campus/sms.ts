import SmsConsent from '../../../modules/sms-consent';

import { extractCode } from './sms-code';

/**
 * Take over an SMS verification code with one tap (Android SMS User Consent, modules/sms-consent):
 * watches for the next SMS for up to 5 minutes; Android asks the user to allow reading that one
 * message; the code is extracted locally. Null when unavailable, denied, timed out or unclear —
 * the user then types it (iOS offers it above the keyboard via textContentType="oneTimeCode").
 */
export async function awaitSmsCode(): Promise<string | null> {
  if (!SmsConsent) return null;
  try {
    return extractCode(await SmsConsent.awaitMessage(null));
  } catch {
    return null;
  }
}

export function cancelSmsWait() {
  try {
    SmsConsent?.cancel();
  } catch {
    // nothing pending
  }
}

export const smsAutofillAvailable = SmsConsent != null;
