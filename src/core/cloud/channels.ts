import {
  createChannelResponse,
  deriveShareKeys,
  fromB64url,
  generateBoxKeyPair,
  generateShareSecret,
  joinHash,
  open,
  ownerInFrame,
  ownerPeerKey,
  patchChannelResponse,
  paths,
  seal,
  toB64url,
  type OwnerInFrame,
  type OwnerOutFrame,
  type RandomBytes,
} from '@pku-harness/cloud-protocol';
import { CloudError, isCloudError, type Channel, type ChannelCloseReason, type ChannelEvent, type ChannelEventType, type SecretLink } from '@pku-harness/sdk';

import type { CloudClient } from './client';
import { toWebSocketURL } from './config';
import { channelLink } from './secret-link';

/**
 * Owner side of E2E relay channels (docs/CLOUD.md §1.3, §2.3, §2.7).
 *
 * - `open` makes a fresh link secret `k` and channel X25519 keypair; the server gets only
 *   `joinHash(authKey)`, the channel public key and `meta` sealed with `encKey`.
 * - The owner WebSocket delivers joins (with each peer's ephemeral public key), leaves and
 *   sealed peer frames. Each peer gets its own key (`ownerPeerKey`); `send('*')` seals one frame
 *   per connected peer.
 * - Mailbox blobs (batch mode) are sealed with `encKey`, readable by any holder of the link.
 * - Channel secrets are persisted per channel (SecureStore in the app), so a share survives an
 *   app restart; the socket reconnects with backoff, and at once on foreground / network change.
 *
 * Frames and mailbox blobs are sealed without associated data (viewer pages do the same).
 * Pure: HTTP client, socket factory, persistence and randomness are injected.
 */

/** What we persist per channel (secret: SecureStore only). */
export interface ChannelSecret {
  id: string;
  pluginId: string;
  baseURL: string;
  /** base64url link secret. */
  k: string;
  chanSec: string;
  chanPub: string;
  expiresAt: number;
  maxPeers: number;
  createdAt: number;
}

/** Non-secret index entry (kv), to find secrets at boot. */
export type ChannelIndexEntry = { id: string; pluginId: string; expiresAt: number };

export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code?: number; reason?: string }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export interface ChannelPersistence {
  saveSecret(s: ChannelSecret): Promise<void>;
  loadSecret(id: string): Promise<ChannelSecret | undefined>;
  deleteSecret(id: string): Promise<void>;
  loadIndex(): Promise<ChannelIndexEntry[]>;
  saveIndex(entries: ChannelIndexEntry[]): Promise<void>;
}

export interface ChannelDeps {
  client: CloudClient;
  rand: RandomBytes;
  persist: ChannelPersistence;
  /** Open a WebSocket with headers (React Native's WebSocket takes `{ headers }`). */
  socket(url: string, headers: Record<string, string>): SocketLike;
  /** Max sealed frame size (meta.limits.channels.frameBytes). */
  frameBytes?(): number;
  now?: () => number;
  /** Timers (injectable for tests). */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
  onError?(e: unknown): void;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
const DEFAULT_FRAME_BYTES = 4096;

type Peer = { id: string; pub: string; joinedAt: number; online: boolean; key: Uint8Array };

export class OwnerChannel implements Channel {
  readonly id: string;
  readonly link: SecretLink;
  private readonly encKey: Uint8Array;
  private readonly chanSec: Uint8Array;
  private readonly chanPub: Uint8Array;
  private peerMap = new Map<string, Peer>();
  private listeners = new Map<ChannelEventType, Set<(e: ChannelEvent) => void>>();
  private socket: SocketLike | null = null;
  private state: 'idle' | 'connecting' | 'open' | 'closed' = 'idle';
  private attempt = 0;
  private retryTimer: unknown = null;
  private expiryTimer: unknown = null;
  private dialing = false;

  constructor(
    private secret: ChannelSecret,
    private readonly deps: ChannelDeps,
    private readonly onFinal: (id: string) => void,
  ) {
    this.id = secret.id;
    const k = fromB64url(secret.k);
    this.encKey = deriveShareKeys(k).encKey;
    this.chanSec = fromB64url(secret.chanSec);
    this.chanPub = fromB64url(secret.chanPub);
    this.link = channelLink(secret.baseURL, secret.id, k);
    this.armExpiry();
  }

  get expiresAt() {
    return this.secret.expiresAt;
  }

  get pluginId() {
    return this.secret.pluginId;
  }

  get closed() {
    return this.state === 'closed';
  }

  get connected() {
    return this.state === 'open';
  }

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  private timeout(fn: () => void, ms: number) {
    return (this.deps.setTimeout ?? ((f, m) => setTimeout(f, m)))(fn, ms);
  }

  private clear(h: unknown) {
    if (h != null) (this.deps.clearTimeout ?? ((x) => clearTimeout(x as ReturnType<typeof setTimeout>)))(h);
  }

  private armExpiry() {
    this.clear(this.expiryTimer);
    // setTimeout overflows above ~24.8 days; channels live ≤ 24 h.
    this.expiryTimer = this.timeout(() => this.finalize('expired'), Math.max(0, this.secret.expiresAt - this.now()));
  }

  peers() {
    return [...this.peerMap.values()].filter((p) => p.online).map((p) => ({ id: p.id, joinedAt: p.joinedAt }));
  }

  on(ev: ChannelEventType, fn: (e: ChannelEvent) => void) {
    let set = this.listeners.get(ev);
    if (!set) this.listeners.set(ev, (set = new Set()));
    set.add(fn);
    this.connect();
    return () => void set.delete(fn);
  }

  private emit(e: ChannelEvent) {
    this.listeners.get(e.type)?.forEach((fn) => {
      try {
        fn(e);
      } catch (err) {
        this.deps.onError?.(err);
      }
    });
  }

  /** Open the owner socket if it isn't (idempotent). */
  connect() {
    if (this.state !== 'idle') return;
    if (this.secret.expiresAt <= this.now()) return this.finalize('expired');
    this.state = 'connecting';
    void this.dial();
  }

  /** Reconnect now (foreground, network back) instead of waiting for the backoff. */
  nudge() {
    if (this.state === 'closed' || this.state === 'open') return;
    if (this.dialing || (this.state === 'connecting' && this.socket)) return;
    this.clear(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    this.state = 'idle';
    this.connect();
  }

  private async dial() {
    if (this.dialing) return;
    this.dialing = true;
    let token: string;
    try {
      token = await this.deps.client.token(this.secret.pluginId, ['channels']);
    } catch (e) {
      this.dialing = false;
      if (isCloudError(e, 'gone')) return this.finalize('expired');
      return this.scheduleRetry();
    }
    this.dialing = false;
    if (this.state !== 'connecting') return;
    // Header for native clients; `?t=` too, for providers that read it like the peer socket.
    const url = toWebSocketURL(this.secret.baseURL, `${paths.channelWs(this.id)}?t=${encodeURIComponent(token)}`);
    let ws: SocketLike;
    try {
      ws = this.deps.socket(url, { Authorization: `Bearer ${token}` });
    } catch {
      return this.scheduleRetry();
    }
    this.socket = ws;
    ws.onopen = () => {
      if (this.socket !== ws) return;
      this.state = 'open';
      this.attempt = 0;
    };
    ws.onmessage = (e) => {
      if (this.socket === ws) this.handle(e.data);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.socket = null;
      if (this.state === 'closed') return;
      // Peers are offline as far as we know until the next hello.
      for (const p of this.peerMap.values()) p.online = false;
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    if (this.state === 'closed') return;
    if (this.secret.expiresAt <= this.now()) return this.finalize('expired');
    this.state = 'connecting';
    const delay = BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)]!;
    this.clear(this.retryTimer);
    this.retryTimer = this.timeout(() => {
      this.retryTimer = null;
      if (this.state === 'connecting' && !this.socket) void this.dial();
    }, delay);
  }

  private peerKey(peerPub: string) {
    return ownerPeerKey(this.chanSec, this.chanPub, fromB64url(peerPub), this.encKey);
  }

  private addPeer(id: string, pub: string, joinedAt: number, online: boolean): boolean {
    const known = this.peerMap.get(id);
    if (known && known.pub === pub) {
      const wasOnline = known.online;
      known.online = online;
      return !wasOnline && online;
    }
    let key: Uint8Array;
    try {
      key = this.peerKey(pub);
    } catch {
      return false; // low-order key: ignore the peer
    }
    this.peerMap.set(id, { id, pub, joinedAt, online, key });
    return online;
  }

  /** Handle one server frame (exposed for tests through the socket). */
  private handle(data: unknown) {
    let frame: OwnerInFrame;
    try {
      const r = ownerInFrame.safeParse(JSON.parse(typeof data === 'string' ? data : String(data)));
      if (!r.success) return;
      frame = r.data;
    } catch {
      return;
    }
    switch (frame.t) {
      case 'hello': {
        this.secret = { ...this.secret, expiresAt: frame.expiresAt };
        this.armExpiry();
        const present = new Set(frame.peers.map((p) => p.peerId));
        for (const p of this.peerMap.values()) {
          if (!present.has(p.id)) {
            this.peerMap.delete(p.id);
            this.emit({ type: 'leave', peerId: p.id, at: this.now() });
          }
        }
        for (const p of frame.peers) if (this.addPeer(p.peerId, p.peerPub, p.joinedAt, p.online)) this.emit({ type: 'join', peerId: p.peerId, at: p.joinedAt });
        return;
      }
      case 'join':
        if (this.addPeer(frame.peerId, frame.peerPub, frame.at, true)) this.emit({ type: 'join', peerId: frame.peerId, at: frame.at });
        return;
      case 'leave': {
        const p = this.peerMap.get(frame.peerId);
        if (!p) return;
        p.online = false;
        this.emit({ type: 'leave', peerId: frame.peerId, at: frame.at });
        return;
      }
      case 'msg': {
        const p = this.peerMap.get(frame.peerId);
        if (!p) return;
        let msg: unknown;
        try {
          msg = open(p.key, frame.env);
        } catch {
          return; // tampered or for another key: drop
        }
        this.emit({ type: 'message', peerId: p.id, msg });
        return;
      }
      case 'closed':
        return this.finalize(frame.reason);
      case 'error':
        if (frame.code === 'gone' || frame.code === 'not_found') this.finalize('expired');
        return;
      case 'pong':
        return;
    }
  }

  private write(frame: OwnerOutFrame) {
    if (this.state !== 'open' || !this.socket) throw new CloudError('offline', 'channel is reconnecting');
    const text = JSON.stringify(frame);
    const max = this.deps.frameBytes?.() ?? DEFAULT_FRAME_BYTES;
    if (text.length > max) throw new CloudError('quota', `frame of ${text.length} bytes exceeds ${max}`);
    this.socket.send(text);
  }

  async send(peerId: string | '*', msg: unknown): Promise<void> {
    if (this.state === 'closed') throw new CloudError('gone', 'channel is closed');
    this.connect();
    if (this.state !== 'open') throw new CloudError('offline', 'channel is reconnecting');
    const targets = peerId === '*' ? [...this.peerMap.values()].filter((p) => p.online) : [this.peerMap.get(peerId)];
    for (const p of targets) {
      if (!p) throw new CloudError('gone', `unknown peer ${peerId}`);
      this.write({ t: 'msg', to: p.id, env: seal(p.key, msg, { rand: this.deps.rand }) });
    }
  }

  /** Drop a peer and free its seat (重置查看者). Not in the SDK's Channel yet. */
  async kick(peerId: string): Promise<void> {
    this.write({ t: 'kick', peerId });
    const p = this.peerMap.get(peerId);
    if (p) {
      this.peerMap.delete(peerId);
      if (p.online) this.emit({ type: 'leave', peerId, at: this.now() });
    }
  }

  readonly mailbox = {
    put: async (slot: string, msg: unknown, ttlS: number) => {
      this.assertOpen();
      await this.deps.client.request({
        method: 'PUT',
        path: paths.channelMailboxSlot(this.id, slot),
        auth: { plugin: this.secret.pluginId, services: ['channels'] },
        body: { env: seal(this.encKey, msg, { rand: this.deps.rand }), ttlS },
      });
    },
    clear: async () => {
      this.assertOpen();
      await this.deps.client.request({ method: 'DELETE', path: paths.channelMailbox(this.id), auth: { plugin: this.secret.pluginId, services: ['channels'] } });
    },
  };

  private assertOpen() {
    if (this.state === 'closed') throw new CloudError('gone', 'channel is closed');
  }

  async extend(ttlS: number): Promise<void> {
    this.assertOpen();
    const res = await this.deps.client.request({
      method: 'PATCH',
      path: paths.channel(this.id),
      auth: { plugin: this.secret.pluginId, services: ['channels'] },
      body: { ttlS },
      schema: patchChannelResponse,
    });
    this.secret = { ...this.secret, expiresAt: res.expiresAt };
    this.armExpiry();
    await this.deps.persist.saveSecret(this.secret);
  }

  async close(): Promise<void> {
    if (this.state === 'closed') return;
    try {
      await this.deps.client.request({ method: 'DELETE', path: paths.channel(this.id), auth: { plugin: this.secret.pluginId, services: ['channels'] } });
    } catch (e) {
      // Already gone at the provider is fine; offline still closes locally (the server's TTL GC ends it).
      if (!isCloudError(e, 'gone') && !isCloudError(e, 'offline')) throw e;
    }
    this.finalize('owner');
  }

  /** Close locally without telling the provider (local wipe). */
  dispose() {
    this.finalize('owner');
  }

  private finalize(reason: ChannelCloseReason) {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.clear(this.retryTimer);
    this.clear(this.expiryTimer);
    const ws = this.socket;
    this.socket = null;
    try {
      ws?.close(1000, 'closed');
    } catch {
      // already closed
    }
    for (const p of this.peerMap.values()) p.online = false;
    this.onFinal(this.id);
    this.emit({ type: 'closed', reason });
  }
}

/**
 * All owner channels on one provider, across plugins. Each plugin only reaches its own (the
 * binding passes its id).
 */
export class ChannelManager {
  private channels = new Map<string, OwnerChannel>();
  private loaded = false;

  constructor(private readonly deps: ChannelDeps) {}

  /** Restore persisted channels (boot). Expired ones are dropped. Sockets connect lazily. */
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    const now = this.deps.now?.() ?? Date.now();
    const index = await this.deps.persist.loadIndex().catch(() => [] as ChannelIndexEntry[]);
    for (const entry of index) {
      if (this.channels.has(entry.id)) continue;
      const secret = entry.expiresAt > now ? await this.deps.persist.loadSecret(entry.id).catch(() => undefined) : undefined;
      if (!secret) {
        await this.deps.persist.deleteSecret(entry.id).catch(() => {});
      } else if (secret.baseURL !== this.deps.client.baseURL) {
        this.foreign.push(entry); // another provider's: leave it alone
      } else {
        this.channels.set(secret.id, this.make(secret));
      }
    }
    await this.saveIndex();
  }

  private make(secret: ChannelSecret) {
    return new OwnerChannel(secret, this.deps, (id) => {
      this.channels.delete(id);
      void this.deps.persist.deleteSecret(id).catch(() => {});
      void this.saveIndex();
    });
  }

  /** Index = this provider's live channels + other providers' entries (kept for when the user switches back). */
  private async saveIndex() {
    const mine = [...this.channels.values()].map((c) => ({ id: c.id, pluginId: c.pluginId, expiresAt: c.expiresAt }));
    await this.deps.persist.saveIndex([...mine, ...this.foreign]).catch(() => {});
  }

  private foreign: ChannelIndexEntry[] = [];

  async open(pluginId: string, opts: { ttlS: number; maxPeers?: number; page?: string; meta?: unknown }): Promise<OwnerChannel> {
    const k = generateShareSecret(this.deps.rand);
    const { authKey, encKey } = deriveShareKeys(k);
    const chan = generateBoxKeyPair(this.deps.rand);
    const maxPeers = opts.maxPeers ?? 1;
    const res = await this.deps.client.request({
      method: 'POST',
      path: paths.channels(),
      auth: { plugin: pluginId, services: ['channels'] },
      body: {
        ttlS: opts.ttlS,
        maxPeers,
        joinHash: joinHash(authKey),
        meta: seal(encKey, opts.meta ?? null, { rand: this.deps.rand }),
        chanPub: toB64url(chan.publicKey),
        ...(opts.page ? { page: opts.page } : null),
      },
      schema: createChannelResponse,
    });
    const secret: ChannelSecret = {
      id: res.id,
      pluginId,
      baseURL: this.deps.client.baseURL,
      k: toB64url(k),
      chanSec: toB64url(chan.secretKey),
      chanPub: toB64url(chan.publicKey),
      expiresAt: res.expiresAt,
      maxPeers,
      createdAt: this.deps.now?.() ?? Date.now(),
    };
    await this.deps.persist.saveSecret(secret);
    const channel = this.make(secret);
    this.channels.set(secret.id, channel);
    await this.saveIndex();
    channel.connect();
    return channel;
  }

  get(pluginId: string, id: string): OwnerChannel | undefined {
    const c = this.channels.get(id);
    if (!c || c.pluginId !== pluginId || c.closed) return undefined;
    c.connect();
    return c;
  }

  list(pluginId: string): OwnerChannel[] {
    return [...this.channels.values()].filter((c) => c.pluginId === pluginId && !c.closed).map((c) => (c.connect(), c));
  }

  all(): OwnerChannel[] {
    return [...this.channels.values()];
  }

  /** Foreground / network back: reconnect sockets now. */
  nudge() {
    for (const c of this.channels.values()) c.nudge();
  }

  /** Close a plugin's channels at the provider (consent withdrawn, data cleared). */
  async closePlugin(pluginId: string) {
    await Promise.all(this.list(pluginId).map((c) => c.close().catch(() => c.dispose())));
  }

  /** Forget every channel locally (identity reset, provider switched, data wiped). */
  disposeAll() {
    for (const c of [...this.channels.values()]) c.dispose();
  }
}
