import { fetch as expoFetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';

import type { DocumentKind } from '@/core/agent/attachments/attachment-rules';
import { newId, type AttachmentPart } from '@/core/agent/session/chat-store';
import { aiConfig, ownProvider } from '@/core/agent/provider';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { activeSpeech } from '@/core/speech/config';
import { t } from '@/i18n';

import DocReader, { type OfficeKind } from '../../../modules/doc-reader';

import { inlinePreview } from './text';

const AUDIO_MIME: Record<string, string> = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', amr: 'audio/amr', '3gp': 'audio/3gpp', webm: 'audio/webm' };

const store = () => {
  const dir = new Directory(Paths.document, 'documents');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

/** Extracted full text of a document attachment (null when it is gone). */
export async function documentText(part: Pick<AttachmentPart, 'uri'>): Promise<string | null> {
  if (!part.uri) return null;
  try {
    const f = new File(part.uri);
    return f.exists ? await f.text() : null;
  } catch {
    return null;
  }
}

/** The native reader's error codes as messages people understand. */
function readError(e: unknown): Error {
  const code = (e as { code?: string }).code;
  if (code === 'ERR_ENCRYPTED') return new Error(t('chat.attach.encrypted'));
  if (code === 'ERR_DAMAGED') return new Error(t('chat.attach.damaged'));
  return new Error(t('chat.attach.docFailed', { reason: e instanceof Error ? e.message : String(e) }));
}

/**
 * A scanned PDF (no text layer) recognised by an OCR plugin (`PluginDef.ocr`, e.g. DeepSeek with
 * the DeepSeek key). Null when none is usable: no such plugin on, or its provider has no key.
 */
async function recognise(file: File): Promise<string | null> {
  const entry = registry
    .ocrProviders()
    .find((p) => pluginSettings.get(p.pluginId).enabled && aiConfig.hasCredential(`${p.pluginId}.${p.def.credentialFrom}`));
  if (!entry) return null;
  const { baseURL, credential } = await ownProvider(entry.pluginId, entry.def.credentialFrom);
  if (!credential) return null;
  const text = await entry.def
    .recognize({ baseURL, credential, fetch: expoFetch as unknown as typeof fetch }, { file: file as unknown as Blob, uri: file.uri, name: file.name, mimeType: 'application/pdf' })
    .catch((e: unknown) => {
      throw new Error(t('chat.attach.ocrFailed', { name: entry.def.name, reason: e instanceof Error ? e.message : String(e) }));
    });
  return text.replace(/## Page \d+/g, '').trim() ? text : null;
}

async function extract(file: File, ext: string): Promise<{ kind: DocumentKind; text: string; units?: number }> {
  if (ext === 'pdf' || ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
    // Parsed natively (modules/doc-reader): system PDF engine / PdfBox, ZipFile + XmlPullParser.
    if (!DocReader) throw new Error(t('chat.attach.docUnsupported'));
    const r = await (ext === 'pdf' ? DocReader.readPdf(file.uri) : DocReader.readOffice(file.uri, ext as OfficeKind)).catch(
      (e: unknown) => {
        throw readError(e);
      },
    );
    // Scanned PDFs have no text layer: only page headings come back. Recognise them if a
    // plugin can (DeepSeek OCR), else say why the file can't be read.
    if (ext === 'pdf' && !r.text.replace(/## Page \d+/g, '').trim()) {
      const text = await recognise(file);
      if (!text) throw new Error(t('chat.attach.scannedPdf'));
      return { kind: ext, text, units: r.units ?? undefined };
    }
    return { kind: ext, text: r.text, units: r.units ?? undefined };
  }
  // Audio: the voice-input service transcribes it (it must accept files, not only live audio).
  const { provider, config } = await activeSpeech();
  if (!provider.def.transcribe) throw new Error(t('chat.attach.audioNeedsFileService', { name: provider.def.name }));
  const text = await provider.def.transcribe(config, { file: file as unknown as Blob, uri: file.uri, name: file.name, mimeType: AUDIO_MIME[ext] ?? 'audio/mpeg' });
  if (!text.trim()) throw new Error(t('chat.voice.nothingHeard'));
  return { kind: 'audio', text };
}

/**
 * Read a picked PDF, Word, Excel, PowerPoint or audio file into text on the phone, keep the full
 * text in the app's storage, and return the attachment: its beginning goes inline in the message
 * and the agent reads the rest with files.read / files.search.
 */
export async function documentAttachment(source: File, name: string, ext: string, bytes: number): Promise<AttachmentPart> {
  const { kind, text, units } = await extract(source, ext);
  const id = newId();
  const out = new File(store(), `${id}.txt`);
  out.create({ overwrite: true });
  out.write(text);
  return {
    type: 'attachment',
    id,
    kind: 'document',
    name,
    mime: kind === 'audio' ? (AUDIO_MIME[ext] ?? 'audio/mpeg') : `application/${ext}`,
    size: bytes,
    uri: out.uri,
    text: inlinePreview(text).head,
    docKind: kind,
    chars: text.length,
    units,
  };
}
