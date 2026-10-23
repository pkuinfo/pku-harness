/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import {
  createChannelRequest,
  deriveShareKeys,
  fromB64url,
  generateBoxKeyPair,
  joinHash,
  open,
  ownerOutFrame,
  parseShareLink,
  seal,
  toB64url,
  viewerPeerKey,
  type Envelope,
} from '@pku-harness/cloud-protocol';
import type { ChannelEvent } from '@pku-harness/sdk';

import { ChannelManager, type ChannelIndexEntry, type ChannelSecret, type SocketLike } from './channels';
import { CloudClient } from './client';
import { BASE, fakeProvider, testRand } from './fake-provider';
import { revealLink } from './secret-link';

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  /** Server side helpers. */
  push(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  drop() {
    this.onclose?.({ code: 1006 });
  }
}

function setup() {
  const created: unknown[] = [];
  const deleted: string[] = [];
  const p = fakeProvider({
    routes: (req) => {
      if (req.method === 'POST' && req.path === '/v1/channels') {
        created.push(req.body);
        return { status: 201, body: { id: 'chan0123456789AB', expiresAt: Date.now() + 900_000 } };
      }
      if (req.method === 'DELETE' && req.path === '/v1/channels/chan0123456789AB') {
        deleted.push(req.path);
        return { status: 200, body: { ok: true } };
      }
      if (req.method === 'PUT' && req.path.startsWith('/v1/channels/chan0123456789AB/mailbox/')) {
        created.push(req.body);
        return { status: 200, body: { ok: true } };
      }
      return undefined;
    },
  });
  const client = new CloudClient(p.deps);
  const sockets: FakeSocket[] = [];
  const secrets = new Map<string, ChannelSecret>();
  let index: ChannelIndexEntry[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const manager = new ChannelManager({
    client,
    rand: testRand,
    socket: (url, headers) => {
      const s = new FakeSocket(url, headers);
      sockets.push(s);
      return s;
    },
    setTimeout: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return t;
    },
    clearTimeout: (h) => {
      const i = timers.indexOf(h as (typeof timers)[number]);
      if (i >= 0) timers.splice(i, 1);
    },
    persist: {
      saveSecret: async (s) => void secrets.set(s.id, s),
      loadSecret: async (id) => secrets.get(id),
      deleteSecret: async (id) => void secrets.delete(id),
      loadIndex: async () => index,
      saveIndex: async (e) => void (index = e),
    },
  });
  return { p, client, manager, sockets, secrets, created, deleted, timers, index: () => index };
}

/** A viewer holding the link: derives keys exactly like the web viewer will. */
function viewer(link: string, chanPub: string) {
  const parsed = parseShareLink(link)!;
  const { encKey, authKey } = deriveShareKeys(parsed.k);
  const kp = generateBoxKeyPair(testRand);
  const peerPub = toB64url(kp.publicKey);
  const key = viewerPeerKey(kp.secretKey, kp.publicKey, fromB64url(chanPub), encKey);
  return { parsed, encKey, authKey, peerPub, key };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('owner channels', () => {
  test('open: server sees only joinHash, sealed meta and the channel key; link is opaque', async () => {
    const s = setup();
    const ch = await s.manager.open('card-share', { ttlS: 900, page: 'view', meta: { nameHint: '王_明', pinRequired: true } });
    const body = createChannelRequest.parse(s.created[0]);
    expect(JSON.stringify(s.created[0])).not.toContain('王_明');
    const link = revealLink(ch.link);
    expect(link.startsWith(`${BASE}/s/chan0123456789AB#k=`)).toBe(true);
    expect(JSON.stringify(ch)).not.toContain('#k=');
    const v = viewer(link, body.chanPub);
    expect(open(v.encKey, body.meta as Envelope)).toEqual({ nameHint: '王_明', pinRequired: true });
    expect(body.joinHash).toBe(joinHash(v.authKey));
    expect(body.maxPeers).toBe(1);
    expect(s.secrets.get('chan0123456789AB')?.pluginId).toBe('card-share');
    expect(s.index().map((e) => e.id)).toEqual(['chan0123456789AB']);
  });

  test('frames round-trip per peer: owner → viewer and viewer → owner', async () => {
    const s = setup();
    const ch = await s.manager.open('card-share', { ttlS: 900 });
    const body = createChannelRequest.parse(s.created[0]);
    await flush();
    const ws = s.sockets[0]!;
    expect(ws.url).toMatch(/^wss:\/\/cloud\.test\/v1\/channels\/chan0123456789AB\/ws\?t=/);
    expect(ws.headers.Authorization).toMatch(/^Bearer tok-/);
    ws.onopen?.();

    const events: ChannelEvent[] = [];
    ch.on('join', (e) => events.push(e));
    ch.on('message', (e) => events.push(e));
    const a = viewer(revealLink(ch.link), body.chanPub);
    const b = viewer(revealLink(ch.link), body.chanPub);
    ws.push({ t: 'join', peerId: 'peerA1', peerPub: a.peerPub, at: 1 });
    ws.push({ t: 'join', peerId: 'peerB2', peerPub: b.peerPub, at: 2 });
    expect(events.map((e) => e.type)).toEqual(['join', 'join']);
    expect(ch.peers().map((p) => p.id)).toEqual(['peerA1', 'peerB2']);

    await ch.send('*', { t: 'code', code: '1234567890', seq: 1 });
    const frames = ws.sent.map((f) => ownerOutFrame.parse(JSON.parse(f)));
    expect(frames).toHaveLength(2); // one sealed frame per peer
    const toA = frames.find((f) => f.t === 'msg' && f.to === 'peerA1')!;
    const toB = frames.find((f) => f.t === 'msg' && f.to === 'peerB2')!;
    if (toA.t !== 'msg' || toB.t !== 'msg') throw new Error('expected msg frames');
    expect(open(a.key, toA.env)).toEqual({ t: 'code', code: '1234567890', seq: 1 });
    expect(open(b.key, toB.env)).toEqual({ t: 'code', code: '1234567890', seq: 1 });
    expect(() => open(a.key, toB.env)).toThrow(); // A can't read B's frame
    expect(ws.sent.join('')).not.toContain('1234567890');

    ws.push({ t: 'msg', peerId: 'peerA1', env: seal(a.key, { t: 'want' }, { rand: testRand }) });
    // A frame sealed with the wrong key is dropped silently.
    ws.push({ t: 'msg', peerId: 'peerA1', env: seal(b.key, { t: 'forged' }, { rand: testRand }) });
    expect(events.filter((e) => e.type === 'message')).toEqual([{ type: 'message', peerId: 'peerA1', msg: { t: 'want' } }]);
  });

  test('send while reconnecting is offline; drop reconnects with backoff; hello restores peers', async () => {
    const s = setup();
    const ch = await s.manager.open('card-share', { ttlS: 900 });
    const body = createChannelRequest.parse(s.created[0]);
    await flush();
    s.sockets[0]!.onopen?.();
    const a = viewer(revealLink(ch.link), body.chanPub);
    s.sockets[0]!.push({ t: 'join', peerId: 'peerA1', peerPub: a.peerPub, at: 1 });
    s.sockets[0]!.drop();
    await expect(ch.send('*', { x: 1 })).rejects.toMatchObject({ code: 'offline' });
    const retry = s.timers.find((t) => t.ms === 1000);
    expect(retry).toBeTruthy();
    retry!.fn();
    await flush();
    expect(s.sockets).toHaveLength(2);
    const ws2 = s.sockets[1]!;
    ws2.onopen?.();
    ws2.push({ t: 'hello', id: 'chan0123456789AB', expiresAt: Date.now() + 600_000, peers: [{ peerId: 'peerA1', peerPub: a.peerPub, joinedAt: 1, online: true }] });
    await ch.send('peerA1', { x: 2 });
    const f = ownerOutFrame.parse(JSON.parse(ws2.sent[0]!));
    if (f.t !== 'msg') throw new Error('expected msg');
    expect(open(a.key, f.env)).toEqual({ x: 2 });
  });

  test('mailbox blobs are sealed with the link key; kick; close cleans up', async () => {
    const s = setup();
    const ch = await s.manager.open('card-share', { ttlS: 900 });
    const body = createChannelRequest.parse(s.created[0]);
    await flush();
    s.sockets[0]!.onopen?.();
    await ch.mailbox.put('slot-1', { code: 'abc' }, 120);
    const v = viewer(revealLink(ch.link), body.chanPub);
    const put = s.created[1] as { env: Envelope; ttlS: number };
    expect(open(v.encKey, put.env)).toEqual({ code: 'abc' });
    expect(put.ttlS).toBe(120);

    s.sockets[0]!.push({ t: 'join', peerId: 'peerA1', peerPub: v.peerPub, at: 1 });
    await ch.kick('peerA1');
    expect(JSON.parse(s.sockets[0]!.sent.at(-1)!)).toEqual({ t: 'kick', peerId: 'peerA1' });

    const closed: ChannelEvent[] = [];
    ch.on('closed', (e) => closed.push(e));
    await ch.close();
    expect(s.deleted).toHaveLength(1);
    expect(closed).toEqual([{ type: 'closed', reason: 'owner' }]);
    expect(s.sockets[0]!.closed).toBe(true);
    expect(s.secrets.size).toBe(0);
    expect(s.manager.get('card-share', ch.id)).toBeUndefined();
    await expect(ch.send('*', {})).rejects.toMatchObject({ code: 'gone' });
  });

  test('server close frame ends the channel; other plugins cannot reach it', async () => {
    const s = setup();
    const ch = await s.manager.open('card-share', { ttlS: 900 });
    expect(s.manager.get('other-plugin', ch.id)).toBeUndefined();
    expect(s.manager.list('other-plugin')).toEqual([]);
    await flush();
    const closed: ChannelEvent[] = [];
    ch.on('closed', (e) => closed.push(e));
    s.sockets[0]!.push({ t: 'closed', reason: 'expired' });
    expect(closed).toEqual([{ type: 'closed', reason: 'expired' }]);
    expect(s.manager.list('card-share')).toEqual([]);
  });

  test('restores persisted channels after a restart', async () => {
    const s = setup();
    const ch = await s.manager.open('card-share', { ttlS: 900 });
    const link = revealLink(ch.link);
    const again = new ChannelManager({
      client: s.client,
      rand: testRand,
      socket: (url, headers) => new FakeSocket(url, headers),
      setTimeout: () => null,
      clearTimeout: () => {},
      persist: {
        saveSecret: async () => {},
        loadSecret: async (id) => s.secrets.get(id),
        deleteSecret: async () => {},
        loadIndex: async () => s.index(),
        saveIndex: async () => {},
      },
    });
    await again.load();
    const restored = again.get('card-share', ch.id);
    expect(restored).toBeTruthy();
    expect(revealLink(restored!.link)).toBe(link);
  });
});
