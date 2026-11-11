/**
 * Pure attachment rules (docs/AGENT-HARNESS.md §4.2): limits, image resize math, which picked
 * files become text attachments or documents read into text. No native imports, so it is unit-tested with `bun test`;
 * `attachments.ts` does the picking and file work on top of it.
 */

/** Attachments per message. */
export const MAX_ATTACHMENTS = 8;
/** Photos per library pick. */
export const MAX_LIBRARY_PICK = 4;
/** Long side of an image sent to the model (px). */
export const MAX_IMAGE_SIDE = 1568;
export const IMAGE_QUALITY = 0.8;
/** Text-like files up to this size are attached inline as text. */
export const MAX_TEXT_FILE_BYTES = 200 * 1024;
export const TEXT_FILE_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'log'] as const;
/** Documents read into text on the phone (the agent reads them with files.read / files.search). */
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx'] as const;
/** Audio transcribed by the speech service set up for voice input. */
export const AUDIO_EXTENSIONS = ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'opus', 'flac', 'amr', '3gp', 'webm'] as const;
/** Largest document read (PDF/Office). */
export const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;
/** Largest audio file sent for transcription (SiliconFlow's limit is 50 MB / 1 h). */
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export type DocumentKind = (typeof DOCUMENT_EXTENSIONS)[number] | 'audio';

/** Free slots left in a message that already has `count` attachments. */
export function remainingSlots(count: number): number {
  return Math.max(0, MAX_ATTACHMENTS - count);
}

/** How many photos one library pick may return (≤ 4, ≤ free slots). 0 = the picker is closed. */
export function libraryPickLimit(count: number): number {
  return Math.min(MAX_LIBRARY_PICK, remainingSlots(count));
}

/**
 * Target size so the long side is at most `max`, keeping the aspect ratio (rounded to whole
 * pixels, never below 1). `null` when the image already fits (re-encode only).
 */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const long = Math.max(width, height);
  if (long <= max) return null;
  const scale = max / long;
  return width >= height
    ? { width: max, height: Math.max(1, Math.round(height * scale)) }
    : { width: Math.max(1, Math.round(width * scale)), height: max };
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export type FileVerdict =
  | { kind: 'text'; mime: string }
  | { kind: 'document'; ext: string }
  | { kind: 'too-large'; limit: 'text' | 'document' | 'audio' }
  | { kind: 'unsupported' };

const MIME_BY_EXT: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  log: 'text/plain',
};

/** Decide what a picked file becomes: inline text, a document read into text, or a refusal. */
export function classifyFile(name: string, size: number | undefined, mime?: string): FileVerdict {
  const ext = extensionOf(name);
  const is = (list: readonly string[]) => list.includes(ext);
  if (is(DOCUMENT_EXTENSIONS) || is(AUDIO_EXTENSIONS)) {
    const audio = is(AUDIO_EXTENSIONS);
    if (size !== undefined && size > (audio ? MAX_AUDIO_BYTES : MAX_DOCUMENT_BYTES)) return { kind: 'too-large', limit: audio ? 'audio' : 'document' };
    return { kind: 'document', ext };
  }
  if (!is(TEXT_FILE_EXTENSIONS)) return { kind: 'unsupported' };
  if (size !== undefined && size > MAX_TEXT_FILE_BYTES) return { kind: 'too-large', limit: 'text' };
  return { kind: 'text', mime: mime && mime !== 'application/octet-stream' ? mime : MIME_BY_EXT[ext] };
}
