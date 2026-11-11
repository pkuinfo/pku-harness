import { NativeModule, requireOptionalNativeModule } from 'expo';

export type OfficeKind = 'docx' | 'xlsx' | 'pptx';
export type DocText = { text: string; units?: number };

/**
 * Reads documents into plain text on the phone, natively (no web view, no JS parser):
 * - `readPdf`: Android's PdfRenderer text API (Android 15+), PdfBox-Android on older phones.
 *   Each page starts with "## Page N"; `units` = page count. Scanned PDFs come back with empty
 *   pages (no OCR).
 * - `readOffice`: .docx / .xlsx / .pptx parsed as zip + XML (ZipFile + XmlPullParser).
 * `uri` is a file:// or content:// uri. Rejects with ERR_DAMAGED, ERR_ENCRYPTED or ERR_READ.
 */
declare class DocReaderModule extends NativeModule {
  /** `engine: "pdfbox"` forces the fallback engine (tests). */
  readPdf(uri: string, engine?: 'pdfbox' | null): Promise<{ text: string; units: number }>;
  readOffice(uri: string, kind: OfficeKind): Promise<DocText>;
}

/** Android only for now; null elsewhere. */
export default requireOptionalNativeModule<DocReaderModule>('DocReader');
