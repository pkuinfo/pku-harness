import { kv } from '@/core/store/kv';
import type { Locale } from '@/i18n';

import { LEGAL_DOCUMENTS } from './documents.generated';
import { LEGAL_VERSION } from './version';

export { LEGAL_VERSION };

/**
 * The Terms of Service and Privacy Policy (docs/legal, also on the website at /terms and
 * /privacy). The app bundles them so they read offline.
 */

export type LegalDoc = keyof typeof LEGAL_DOCUMENTS;
export const isLegalDoc = (s: unknown): s is LegalDoc => s === 'terms' || s === 'privacy';

/** The document's title (its `# heading`) and the Markdown body below it. */
export function legalDocument(doc: LegalDoc, locale: Locale) {
  const text: string = LEGAL_DOCUMENTS[doc][locale];
  const [, title = '', body = text] = /^# (.+)\n+([\s\S]*)$/.exec(text) ?? [];
  return { title, body };
}

const KEY = 'legal.accepted';

export const markLegalAccepted = () => kv('prefs').set(KEY, LEGAL_VERSION);

/** True when the person agreed to (or was told about) an older version, or to none at all. */
export async function legalNoticeDue() {
  return (await kv('prefs').get<string>(KEY)) !== LEGAL_VERSION;
}
