import { compilePlugin, declarations, fileUrl, fingerprintText, LinkError, loadDocument, PluginDocError, resolveLink, widens, type PluginDocument, type PublicFetch } from '@pku-harness/sdk';
import { bundledDocuments } from '@pku-harness/plugins';
import * as Crypto from 'expo-crypto';

import { kv } from '@/core/store/kv';
import { t as tNow } from '@/i18n';

import { registry } from './registry';

/**
 * Plugin documents (docs/PLUGIN-LANGUAGE.md): `PLUGIN.md` folders installed by link, stored on
 * the device and compiled to ordinary PluginDefs. The interpreter is `@pku-harness/sdk` `lang/`;
 * this module only fetches, stores, verifies hashes and checks for updates (§10).
 */

export type DocDeclarations = ReturnType<typeof declarations>;

type Version = { files: Record<string, string>; hash: string; version: string; decl: DocDeclarations };

export type InstalledDoc = Version & {
  id: string;
  /** Canonical install link (re-fetched for updates); null for local drafts. */
  link: string | null;
  /** URL the PLUGIN.md was read from; files resolve relative to it. */
  base: string | null;
  source: 'link' | 'bundled' | 'local';
  verified: boolean;
  installedAt: number;
  updatedAt: number;
  checkedAt?: number;
  pinned?: boolean;
  /** The version before the last update (rollback). */
  previous?: Version;
  /** A fetched update that asks for more access: waits for the user. */
  pending?: Version;
};

export type DocPreview = {
  /** Canonical link; null for a local draft (written with the AI or pasted). */
  link: string | null;
  base: string | null;
  doc: PluginDocument;
  hash: string;
  decl: DocDeclarations;
  verified: boolean;
  /** The installed document this one would replace (same id), if any. */
  replaces?: InstalledDoc;
};

const store = kv('doc-plugins');
/** Drafts handed to the add sheet by the agent (files can't travel in a route URL). */
const drafts = new Map<string, Record<string, string>>();
let docs: InstalledDoc[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const OFFICIAL = 'https://github.com/pkuinfo/pku-harness-plugins/';
const UPDATE_EVERY = 24 * 3_600_000;

/** Public HTTP for the interpreter: RN fetch with a timeout (hosts are checked by the runner). */
const publicFetch: PublicFetch = async (req) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: ctrl.signal });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    return { status: res.status, url: res.url || req.url, headers, body: await res.text() };
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(tNow('app.plugins.doc.timeout', { host: /^https?:\/\/([^/]+)/.exec(req.url)?.[1] ?? req.url }));
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

async function getText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'text/plain, text/markdown, */*' } });
    return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '' };
  } finally {
    clearTimeout(timer);
  }
}

const sha256 = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.HEX });

function isVerified(link: string | null, source: InstalledDoc['source']) {
  return source === 'bundled' || (!!link && link.startsWith(OFFICIAL));
}

async function parse(files: Record<string, string>): Promise<PluginDocument> {
  return loadDocument(async (p) => {
    const text = files[p];
    if (text === undefined) throw new Error(tNow('app.plugins.doc.missingFile', { path: p }));
    return text;
  });
}

function compile(d: InstalledDoc, doc: PluginDocument) {
  return compilePlugin(doc, { verified: d.verified, fetch: publicFetch, source: d.link ?? undefined });
}

async function register(d: InstalledDoc) {
  try {
    registry.register(compile(d, await parse(d.files)));
  } catch (e) {
    console.warn(`plugin document ${d.id} failed to load`, e);
  }
}

/** Fetch a document and every file it names from a link. */
async function fetchFrom(link: string): Promise<{ canonical: string; base: string; doc: PluginDocument; hash: string }> {
  const target = resolveLink(link);
  let base: string | null = null;
  let first = '';
  let lastStatus = 0;
  for (const url of target.candidates) {
    try {
      const r = await getText(url);
      lastStatus = r.status;
      if (r.ok) {
        base = url;
        first = r.text;
        break;
      }
    } catch {
      /* try the next mirror */
    }
  }
  if (!base) throw new Error(lastStatus === 404 ? tNow('app.plugins.doc.notFound') : tNow('app.plugins.doc.unreachable'));
  const from = base;
  const doc = await loadDocument(async (path) => {
    if (path === 'PLUGIN.md') return first;
    const r = await getText(fileUrl(from, path));
    if (!r.ok) throw new Error(tNow('app.plugins.doc.fileFailed', { path, status: r.status }));
    return r.text;
  });
  return { canonical: target.canonical, base, doc, hash: await sha256(fingerprintText(doc.files)) };
}

async function save() {
  await store.set('all', docs);
  emit();
}

function versionOf(doc: PluginDocument, hash: string): Version {
  return { files: doc.files, hash, version: doc.manifest.version, decl: declarations(doc) };
}

export const docPlugins = {
  /** Bundled documents first (shipped with the app), then installed ones (may be newer). */
  async load() {
    docs = (await store.get<InstalledDoc[]>('all')) ?? [];
    for (const [id, b] of Object.entries(bundledDocuments)) {
      if (docs.some((d) => d.id === id)) continue;
      try {
        const doc = await parse(b.files);
        const now = Date.now();
        docs.push({ id, link: b.link, base: null, source: 'bundled', verified: true, installedAt: now, updatedAt: now, ...versionOf(doc, await sha256(fingerprintText(doc.files))) });
      } catch (e) {
        console.warn(`bundled document ${id} is invalid`, e);
      }
    }
    for (const d of docs) await register(d);
    emit();
  },
  list: () => docs,
  get: (id: string) => docs.find((d) => d.id === id),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** Fetch and validate a link without installing (the permission sheet shows the result). */
  async preview(link: string): Promise<DocPreview> {
    const { canonical, base, doc, hash } = await fetchFrom(link);
    const replaces = docs.find((d) => d.id === doc.manifest.id);
    const other = registry.get(doc.manifest.id);
    if (other && !replaces) throw new Error(tNow('app.plugins.doc.idTaken', { id: doc.manifest.id, name: other.name }));
    return { link: canonical, base, doc, hash, decl: declarations(doc), verified: isVerified(canonical, 'link'), replaces };
  },

  /** Validate a local draft (files) for the permission sheet. */
  async previewFiles(files: Record<string, string>): Promise<DocPreview> {
    const doc = await parse(files);
    const replaces = docs.find((d) => d.id === doc.manifest.id);
    const other = registry.get(doc.manifest.id);
    if (other && !replaces) throw new Error(tNow('app.plugins.doc.idTaken', { id: doc.manifest.id, name: other.name }));
    return { link: null, base: null, doc, hash: await sha256(fingerprintText(doc.files)), decl: declarations(doc), verified: false, replaces };
  },

  /** Park a draft for the add sheet; returns the handle for `/plugins/add?draft=`. */
  parkDraft(files: Record<string, string>) {
    const id = Math.random().toString(36).slice(2, 10);
    drafts.set(id, files);
    return id;
  },
  takeDraft: (id: string) => drafts.get(id),

  async install(p: DocPreview) {
    const now = Date.now();
    const prev = docs.find((d) => d.id === p.doc.manifest.id);
    const d: InstalledDoc = {
      id: p.doc.manifest.id,
      link: p.link,
      base: p.base,
      source: p.link ? 'link' : 'local',
      verified: p.verified,
      installedAt: prev?.installedAt ?? now,
      updatedAt: now,
      checkedAt: now,
      previous: prev ? { files: prev.files, hash: prev.hash, version: prev.version, decl: prev.decl } : undefined,
      ...versionOf(p.doc, p.hash),
    };
    docs = [...docs.filter((x) => x.id !== d.id), d];
    await save();
    await register(d);
    return d;
  },

  async uninstall(id: string) {
    const d = docs.find((x) => x.id === id);
    if (!d) return;
    if (d.source === 'bundled') throw new Error(tNow('app.plugins.doc.bundledRemove'));
    docs = docs.filter((x) => x.id !== id);
    await save();
    registry.unregister(id);
  },

  /**
   * Re-fetch linked documents (at most daily unless forced). Same declarations → applied;
   * wider access → kept as `pending` until the user accepts. Returns ids that changed.
   */
  async checkUpdates(opts: { force?: boolean; id?: string } = {}) {
    const changed: string[] = [];
    for (const d of [...docs]) {
      if (opts.id && d.id !== opts.id) continue;
      if (!d.link || d.pinned || d.source === 'local') continue;
      if (!opts.force && d.checkedAt && Date.now() - d.checkedAt < UPDATE_EVERY) continue;
      try {
        const { doc, hash, base } = await fetchFrom(d.link);
        const cur = docs.find((x) => x.id === d.id)!;
        cur.checkedAt = Date.now();
        if (doc.manifest.id !== d.id || hash === cur.hash) continue;
        const next = versionOf(doc, hash);
        if (widens(cur.decl, next.decl)) cur.pending = next;
        else {
          cur.previous = { files: cur.files, hash: cur.hash, version: cur.version, decl: cur.decl };
          Object.assign(cur, next, { base, updatedAt: Date.now(), pending: undefined, source: cur.source === 'bundled' ? 'link' : cur.source });
          await register(cur);
        }
        changed.push(d.id);
      } catch (e) {
        if (e instanceof PluginDocError || e instanceof LinkError) console.warn(`update of ${d.id} is invalid`, e.message);
      }
    }
    await save();
    return changed;
  },

  /** Accept an update that asks for more access. */
  async acceptPending(id: string) {
    const d = docs.find((x) => x.id === id);
    if (!d?.pending) return;
    d.previous = { files: d.files, hash: d.hash, version: d.version, decl: d.decl };
    Object.assign(d, d.pending, { updatedAt: Date.now(), pending: undefined });
    await save();
    await register(d);
  },

  async rollback(id: string) {
    const d = docs.find((x) => x.id === id);
    if (!d?.previous) return;
    const cur = { files: d.files, hash: d.hash, version: d.version, decl: d.decl };
    Object.assign(d, d.previous, { previous: cur, pinned: true, updatedAt: Date.now() });
    await save();
    await register(d);
  },

  async setPinned(id: string, pinned: boolean) {
    const d = docs.find((x) => x.id === id);
    if (!d) return;
    d.pinned = pinned;
    await save();
  },
};
