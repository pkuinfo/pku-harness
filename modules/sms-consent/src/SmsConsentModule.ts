import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * Android SMS User Consent (Google Play services). `awaitMessage()` watches for the next SMS
 * (up to 5 minutes); when it arrives Android asks the user "Allow PKU Harness to read this
 * message?" and resolves with the full text only after Allow. Rejects with ERR_TIMEOUT,
 * ERR_DENIED or ERR_UNAVAILABLE (no Play services). The app never holds an SMS permission.
 */
declare class SmsConsentModule extends NativeModule {
  awaitMessage(senderPhone?: string | null): Promise<string>;
  cancel(): void;
}

/** Android only; null elsewhere (iOS fills codes from the keyboard via textContentType). */
export default requireOptionalNativeModule<SmsConsentModule>('SmsConsent');
