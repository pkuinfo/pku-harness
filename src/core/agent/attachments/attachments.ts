/**
 * Composer attachments (docs/AGENT-HARNESS.md §4.2): camera, photo library and document picks,
 * turned into `AttachmentPart`s the chat stores and the model reads.
 *
 * - Images: long side ≤ 1568 px, JPEG 0.8, kept in `documentDirectory/attachments/<id>.jpg`
 *   (the document directory survives restarts, so drafts, queued and sent messages keep them).
 * - Text-like files (txt md csv json log, ≤ 200 KB) become inline `text` attachments.
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

import { registry } from '@/core/runtime/registry';

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

export const LIMIT_NOTICE = `每条消息最多 ${MAX_ATTACHMENTS} 个附件`;

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
  const base = asset.fileName?.replace(/\.[^.]+$/, '') || '图片';
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
  const notice = failed ? `有 ${failed} 张图片无法读取` : dropped ? LIMIT_NOTICE : undefined;
  return { added, notice };
}

/** 拍照: the system camera, one photo. */
export async function takePhoto(current: number, onProcessing?: OnProcessing): Promise<PickOutcome> {
  if (remainingSlots(current) === 0) return { added: [], notice: LIMIT_NOTICE };
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { added: [], notice: '没有相机权限，可以在系统设置里开启' };
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  if (res.canceled) return { added: [] };
  return storeImages(res.assets, remainingSlots(current), onProcessing);
}

/** 相册: the system photo picker, up to 4 at once (fewer when the message is nearly full). */
export async function pickImages(current: number, onProcessing?: OnProcessing): Promise<PickOutcome> {
  const limit = libraryPickLimit(current);
  if (limit === 0) return { added: [], notice: LIMIT_NOTICE };
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

/** 文件: the document picker; text-like files up to 200 KB become text attachments. */
export async function pickFiles(current: number): Promise<PickOutcome> {
  const slots = remainingSlots(current);
  if (slots === 0) return { added: [], notice: LIMIT_NOTICE };
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return { added: [] };
  const added: AttachmentPart[] = [];
  let unsupported = 0;
  let tooLarge = 0;
  let unreadable = 0;
  for (const asset of res.assets) {
    const cached = new File(asset.uri);
    const verdict = classifyFile(asset.name, asset.size ?? cached.size ?? undefined, asset.mimeType);
    if (verdict.kind === 'text' && added.length < slots) {
      try {
        const text = await cached.text();
        added.push(textAttachment(text, asset.name, verdict.mime));
      } catch {
        unreadable++;
      }
    } else if (verdict.kind === 'too-large') tooLarge++;
    else if (verdict.kind === 'unsupported') unsupported++;
    // The picker's cache copy is no longer needed (text is inline now).
    try {
      if (cached.exists) cached.delete();
    } catch {}
  }
  const overflow = res.assets.length - unsupported - tooLarge - unreadable - added.length;
  const notice = unsupported
    ? '暂不支持这种文件'
    : tooLarge
      ? '文件太大，文本文件最多 200 KB'
      : unreadable
        ? '文件无法读取'
        : overflow > 0
          ? LIMIT_NOTICE
          : undefined;
  return { added, notice };
}

/** A `text` attachment (long paste, small text file). `size` counts characters. */
export function textAttachment(text: string, name = '粘贴的文本', mime = 'text/plain'): AttachmentPart {
  return { type: 'attachment', id: newId(), kind: 'text', name, mime, size: text.length, text };
}

/** Delete an image the user removed before sending (never one a sent message still shows). */
export function discardAttachmentFile(a: AttachmentPart) {
  if (a.kind !== 'image' || !a.uri) return;
  try {
    const f = new File(a.uri);
    if (f.exists) f.delete();
  } catch {}
}
