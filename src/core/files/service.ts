import type { FileInfo, FilesService } from '@pku-harness/sdk';

import { sessionStore } from '@/core/agent/session/chat-store';
import type { AttachmentPart } from '@/core/agent/session/chat-store';

import { documentText } from './documents';
import { searchText, sliceText } from './text';

/** Document attachments in the active chat, newest first. */
function documents(): AttachmentPart[] {
  const state = sessionStore.get(sessionStore.activeId());
  const out: AttachmentPart[] = [];
  for (const m of state?.messages ?? []) for (const p of m.parts) if (p.type === 'attachment' && p.kind === 'document') out.push(p);
  return out.reverse();
}

const info = (a: AttachmentPart): FileInfo => ({ id: a.id, name: a.name, kind: a.docKind ?? 'document', chars: a.chars ?? a.text?.length ?? 0, units: a.units });

async function open(id: string) {
  const doc = documents().find((d) => d.id === id);
  if (!doc) throw new Error(`No document "${id}" in this chat; use files.list for the ids`);
  const text = await documentText(doc);
  if (text == null) throw new Error(`The text of "${doc.name}" is no longer on this phone; ask the user to attach it again`);
  return { doc, text };
}

/**
 * files.list / read / search: the agent reads documents attached in this chat from the text
 * extracted on the phone (src/core/files/documents.ts).
 */
export const documentsService: FilesService = {
  list: async () => documents().map(info),
  read: async (id, offset, length) => {
    const { doc, text } = await open(id);
    const slice = sliceText(text, offset, length);
    return { ...info(doc), offset: slice.offset, text: slice.text, next: slice.next };
  },
  search: async (id, query, max) => {
    const { doc, text } = await open(id);
    return { id: doc.id, name: doc.name, matches: searchText(text, query, { max }) };
  },
};
