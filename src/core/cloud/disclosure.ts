import type { CloudManifest } from '@pku-harness/sdk';

/** A manifest's disclosure lines in the app language (English falls back to Chinese). */
export function disclosureLines(manifest: CloudManifest, locale: 'zh-Hans' | 'en'): string[] {
  return locale === 'en' && manifest.disclosure.en?.length ? manifest.disclosure.en : manifest.disclosure.zh;
}
