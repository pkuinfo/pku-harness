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

/**
 * Whether to tell the person about the documents: 'new' when they never saw any version (they set
 * up before the documents existed), 'updated' when they saw an older one, null when current.
 */
export async function legalNoticeDue(): Promise<'new' | 'updated' | null> {
  const seen = await kv('prefs').get<string>(KEY);
  if (seen === LEGAL_VERSION) return null;
  return seen ? 'updated' : 'new';
}
