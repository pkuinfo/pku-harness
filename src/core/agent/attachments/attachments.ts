/**
 * Composer attachments (docs/AGENT-HARNESS.md §4.2): camera, photo library and document picks,
 * turned into `AttachmentPart`s the chat stores and the model reads.
 *
 * - Images: long side ≤ 1568 px, JPEG 0.8, kept in `documentDirectory/attachments/<id>.jpg`
 *   (the document directory survives restarts, so drafts, queued and sent messages keep them).
 * - Text-like files (txt md csv json log, ≤ 200 KB) become inline `text` attachments.
 * - PDF / Word / Excel / PowerPoint (≤ 30 MB) and audio (≤ 50 MB) become `document` attachments:
 *   the text is read on the phone (src/core/files/documents.ts) and kept in documentDirectory.
 * - Anything else is refused with a reason the composer shows as a toast.
 *
 * The model-visible form (base64 image parts, `<attachment>` blocks) is built in run.ts /
 * session-utils.ts. APIs per the SDK 58 docs: expo-image-picker, expo-document-picker, expo-image-manipulator
 * (`ImageManipulator.manipulate` contextual API), expo-file-system (`File` / `Directory` / `Paths`).
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { documentAttachment } from '@/core/files/documents';
import { registry } from '@/core/runtime/registry';
import { t } from '@/i18n';

import {
  classifyFile,
  fitWithin,
  IMAGE_QUALITY,
  libraryPickLimit,
  MAX_ATTACHMENTS,
  remainingSlots,
} from './attachment-rules';
import { newId, type AttachmentPart } from '@/core/agent/session/chat-store';

export * from './attachment-rules';

/** What a pick produced, plus an optional reason to show (partial or refused picks). */
export type PickOutcome = { added: AttachmentPart[]; notice?: string };

/** "每条消息最多 9 个附件", in the app language. */
export const limitNotice = () => t('chat.attach.limit', { max: MAX_ATTACHMENTS });

const attachmentsDir = () => new Directory(Paths.document, 'attachments');

/** The catalog entry of a provider's model (name, description, context window, modalities). */
export function modelInfo(providerId: string | undefined, model: string | undefined) {
  if (!providerId || !model) return undefined;
  return registry.provider(providerId)?.def.models.find((m) => m.id === model);
}

/** Images are offered only when the model lists 'image' in its input modalities (§4.2). */
export function acceptsImages(providerId: string | undefined, model: string | undefined): boolean {
  return !!modelInfo(providerId, model)?.inputModalities?.includes('image');
}

/** Re-encode (and shrink if needed) one picked image into the attachments directory. */
async function storeImage(asset: { uri: string; width: number; height: number; fileName?: string | null }): Promise<AttachmentPart> {
  const id = newId();
  const ctx = ImageManipulator.manipulate(asset.uri);
  const target = fitWithin(asset.width, asset.height);
  if (target) ctx.resize(target);
  const ref = await ctx.renderAsync();
  const result = await ref.saveAsync({ format: SaveFormat.JPEG, compress: IMAGE_QUALITY });
  const dir = attachmentsDir();
  dir.create({ idempotent: true, intermediates: true });
  const out = new File(dir, `${id}.jpg`);
  // The manipulator writes into the cache directory; move it somewhere that lasts.
  new File(result.uri).moveSync(out);
  const base = asset.fileName?.replace(/\.[^.]+$/, '') || t('chat.attach.imageName');
  return {
    type: 'attachment',
    id,
    kind: 'image',
    name: `${base}.jpg`,
    mime: 'image/jpeg',
    size: out.size ?? 0,
    uri: out.uri,
    width: result.width,
    height: result.height,
  };
}

/** Called once the system picker returns, with how many images are now being processed. */
export type OnProcessing = (count: number) => void;

async function storeImages(assets: ImagePicker.ImagePickerAsset[], slots: number, onProcessing?: OnProcessing): Promise<PickOutcome> {
  onProcessing?.(Math.min(assets.length, slots));
  const added: AttachmentPart[] = [];
  let failed = 0;
  for (const a of assets.slice(0, slots)) {
    try {
      added.push(await storeImage(a));
    } catch {
      failed++;
    }
  }
  const dropped = Math.max(0, assets.length - slots);
  const notice = failed ? t('chat.attach.imagesUnreadable', { count: failed }) : dropped ? limitNotice() : undefined;
  return { added, notice };
}

/** 拍照: the system camera, one photo. */
export async function takePhoto(current: number, onProcessing?: OnProcessing): Promise<PickOutcome> {
  if (remainingSlots(current) === 0) return { added: [], notice: limitNotice() };
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { added: [], notice: t('chat.attach.noCamera') };
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  if (res.canceled) return { added: [] };
  return storeImages(res.assets, remainingSlots(current), onProcessing);
}

/** 相册: the system photo picker, up to 4 at once (fewer when the message is nearly full). */
export async function pickImages(current: number, onProcessing?: OnProcessing): Promise<PickOutcome> {
  const limit = libraryPickLimit(current);
  if (limit === 0) return { added: [], notice: limitNotice() };
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 1,
    exif: false,
  });
  if (res.canceled) return { added: [] };
  return storeImages(res.assets, limit, onProcessing);
}

/**
 * 文件: the document picker. Text-like files up to 200 KB become text attachments; PDF / Word /
 * Excel / PowerPoint are read into text natively and audio is transcribed (src/core/files).
 * `onProcessing` gets how many are being read, so the tray shows placeholders meanwhile.
 */
export async function pickFiles(current: number, onProcessing?: OnProcessing): Promise<PickOutcome> {
  const slots = remainingSlots(current);
  if (slots === 0) return { added: [], notice: limitNotice() };
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return { added: [] };
  const picked = res.assets.map((asset) => {
    const cached = new File(asset.uri);
    return { asset, cached, verdict: classifyFile(asset.name, asset.size ?? cached.size ?? undefined, asset.mimeType) };
  });
  const accepted = picked.filter((p) => p.verdict.kind === 'text' || p.verdict.kind === 'document').slice(0, slots);
  const documents = accepted.filter((p) => p.verdict.kind === 'document').length;
  if (documents) onProcessing?.(documents);

  const added: AttachmentPart[] = [];
  let unsupported = 0;
  let tooLarge: 'text' | 'document' | 'audio' | undefined;
  let unreadable = 0;
  let failure: string | undefined;
  for (const { asset, cached, verdict } of picked) {
    if (verdict.kind === 'too-large') tooLarge ??= verdict.limit;
    else if (verdict.kind === 'unsupported') unsupported++;
    else if (accepted.some((p) => p.cached === cached)) {
      try {
        if (verdict.kind === 'text') added.push(textAttachment(await cached.text(), asset.name, verdict.mime));
        else added.push(await documentAttachment(cached, asset.name, verdict.ext, asset.size ?? cached.size ?? 0));
      } catch (e) {
        unreadable++;
        // The reader's message says why (scanned PDF, password, no file transcription…).
        if (verdict.kind === 'document') failure ??= e instanceof Error ? e.message : String(e);
      }
    }
    // The picker's cache copy is no longer needed (the text is inline or stored now).
    try {
      if (cached.exists) cached.delete();
    } catch {}
  }
  const overflow = picked.filter((p) => p.verdict.kind === 'text' || p.verdict.kind === 'document').length - accepted.length;
  const notice = failure
    ? failure
    : unsupported
      ? t('chat.attach.unsupported')
      : tooLarge
        ? t(tooLarge === 'text' ? 'chat.attach.tooLarge' : tooLarge === 'audio' ? 'chat.attach.audioTooLarge' : 'chat.attach.docTooLarge')
        : unreadable
          ? t('chat.attach.unreadable')
          : overflow > 0
            ? limitNotice()
            : undefined;
  return { added, notice };
}

/** A `text` attachment (long paste, small text file). `size` counts characters. */
export function textAttachment(text: string, name = t('chat.attach.pasted'), mime = 'text/plain'): AttachmentPart {
  return { type: 'attachment', id: newId(), kind: 'text', name, mime, size: text.length, text };
}

/** Delete the image or document text the user removed before sending (never one a sent message still shows). */
export function discardAttachmentFile(a: AttachmentPart) {
  if ((a.kind !== 'image' && a.kind !== 'document') || !a.uri) return;
  try {
    const f = new File(a.uri);
    if (f.exists) f.delete();
  } catch {}
}
