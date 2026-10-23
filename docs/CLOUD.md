# Design: PKU Harness Cloud (plugin backend standard) and the `card-share` plugin

Status: accepted 2026-10-23, with the recommended defaults in §5 (to be revisited: hosting, domain). Written from a read-only exploration of `pku-harness`, `pku-harness/plugins`, `pkubdcard`, `pkucli/crates/campuscard` and `deepseek-harness`.

## 0. Summary

- **Card sharing needs a server only as a blind relay.** The server never holds the card JWT. The sharer's phone stays the only place that can mint payment codes. It encrypts each code to the viewer with a key that sits in the share link's `#fragment`, and the relay only forwards ciphertext. If a spike shows that codes stay valid long enough, pre-generated encrypted batches can also cover times when the phone is offline.
- **The cloud standard follows DeepSeek Harness's capability seam**, split into Service Definition, Service Provider and Consumer (`deepseek-harness/.agents/notes/implemented/architecture/2026-06-13-capability-seams.md`):
  - Service Definition: SDK types plus a versioned HTTP protocol (`/v1`).
  - Service Providers: our hosted instance, the open-source reference server (self-hosted) and BYO (any base URL).
  - Consumers: plugins, through a **per-plugin bound** `ctx.cloud`.
- **The default is a dumb, end-to-end-encrypted server.** Each device has its own keypair identity. No campus credential or campus identity ever leaves the phone. Server-side plugin code is the exception: plugins have to declare it and users have to approve it.

---

## 1. Does card sharing need a server?

### 1.1 Payment-code lifecycle (from the code)

| Fact | Source |
|---|---|
| The card session is a synjones JWT from portal ssoLogin → `redirectToCard.do` → `berserker-auth` (`synjones-auth=<JWT>`). The app caches it 23 h in SecureStore (`campus.card.jwt`) and refreshes on 401. | `src/core/campus/account.ts:104-150`, `pkubdcard/internal/card/card.go:28` |
| A code takes 2 calls: `codebarPayinfo` (payacc, paytype, balance), then `batchGetBarCodeGet?account&payacc&paytype` → `{ barcode: string[] }`. **Every client uses only `[0]`.** | `plugins/plugins/wallet/src/card/api.ts` `paymentCode`, `pkucli/crates/campuscard/src/api.rs:205`, `card.go:183` |
| Codes only work in 数字卡 mode (`setUseCardConfig cardType=1`). | `api.ts` `CARD_TYPE_DIGITAL` |
| Refresh cadence: the wallet refreshes every 30 s (`REFRESH_S`). pkubdcard refreshes every 55 s, with the comment that the code "rolls ~every 60s". Nobody has measured the real validity. | `wallet/src/card/pay.tsx`, `pkubdcard/web/src/UseFlow.tsx:9,68` |
| The same JWT reaches the whole card API: holder name and student number, account, balance, transactions (merchant and time, which amounts to a location history), card-mode switch, recharge orders (`/charge/order/thirdOrder` carries the JWT in the form), and unlimited payment codes. There is no known logout or revoke endpoint. | `wallet/src/card/tools.ts`, `recharge.ts` |

What is still unknown and must be measured before any design depends on it (spike **S0**, §4):
1. How many entries `barcode[]` returns.
2. How long one code stays valid after it is fetched, tested at a real POS at 30 s, 60 s, 2 min, 5 min and 15 min.
3. Whether fetching a new code invalidates older ones.
4. Whether codes are single-use.
5. Whether the codes are offline TOTP-like (a "batch" endpoint suggests the official H5 pre-fetches some for offline use).

### 1.2 Options

| | (a) Hosted relay holds the JWT (pkubdcard) | (b) Relay forwards to the sharer's phone | (c) Pre-generated E2E batches in a dumb store | (d) Local only |
|---|---|---|---|---|
| Server sees | JWT = ~23 h of unrevocable spending power plus name, student number and transaction history | Only ciphertext, timing and IPs (if E2E) | Only ciphertext blobs and sizes | Nothing |
| Phone must be online | No | Yes, during the share | Only when uploading or refilling | n/a |
| Works if codes live ≤ 60 s | Yes | Yes | **No** (batch dies in a minute) | Only for "screenshot right now" |
| Revocation | Delete the share, but the JWT stays valid at the operator | Immediate and server-independent: the phone stops answering | Delete the blobs; codes already downloaded stay usable until they expire | n/a |
| Fits "credentials never leave the device" (AGENTS.md principle 6) | **Violates it** | Yes | Yes | Yes |
| China realities | Fine | FCM is unreliable on Chinese Android, so we cannot count on waking the phone; it has to hold a connection | Fine | Fine |

### 1.3 Recommendation: (b) as primary, (c) as an add-on if S0 allows, (d) as a zero-server fallback. Reject (a).

- **Live mode (default).** When the share starts, the sharer's phone starts an Android foreground service with an ongoing notification: "正在共享付款码 · 剩 28:12 · 已出示 2 次 · 停止". The phone holds a WebSocket to the relay. When a viewer is present, it fetches a fresh code every 25 s or whenever the viewer asks (`want`), seals it to the viewer and sends it. Latency at the till is about 0, because the code is pushed ahead of time. On iOS, live mode works only while the app is open (no equivalent foreground service). Batch mode is the iOS answer if S0 allows it.
- **Batch mode (only if S0 shows codes valid ≥ N minutes or single-use until consumed).** The phone uploads K sealed codes with time slots to the channel's mailbox, so the share survives the phone going offline. Refills happen when the app is foregrounded and from the existing exact-wake path (`src/core/scheduler/exact-wake.ts`).
- **One-shot (d).** "发一个码": mint one code and send it as a QR image through the system share sheet (WeChat). There is no server. It is only offered if S0 shows validity ≥ 60 s.
- **Why reject (a) even for BYO:** the JWT is a full-account bearer token with no revoke. pkubdcard stays available for people who accept that model. pku-harness should not normalise it.

**Security model of the recommended design**
- Link: `https://<relay>/s/<channelId>#k=<base64url 32 bytes>`. The fragment is never sent to the server.
  - `authKey = HKDF(k, "join")`. The server stores only `sha256(authKey)` so it can gate joins.
  - `encKey = HKDF(k, "enc")`. The server never sees it.
- On join, the viewer sends `authKey` plus an ephemeral X25519 public key. Frames between device and peer then use `peerKey = HKDF(X25519(chanPriv, peerPub) ‖ encKey)` with XChaCha20-Poly1305.
- **Claim:** `maxPeers = 1` by default. The first joiner binds the channel and the server rejects later joiners, so a forwarded link is useless. The sharer can "重置查看者".
- **Device-verified gates**, ported from pkubdcard but enforced on the phone:
  - Masked-name hint (`王_明`), stored as encrypted channel meta.
  - Optional PIN.
  - 5 failures → the device closes the channel.
  - The server cannot verify these because it can't read them, so it only applies rate limits.
- **Spend cap (new; this is what makes sharing safe without trusting the server).**
  - The sharer sets ¥ max and/or a number of codes.
  - The device polls the turnover endpoint (`/berserker-search/search/personal/turnover`) at +20 s, +60 s and +120 s after each code it issues, and every 2 min while the share is active.
  - It stops issuing and closes the channel when the cap is reached.
  - Caveat to state in the UI: the cap is checked per payment, so the last payment can exceed it. The card's own `daycostlimit` still applies.
- **Abuse limits.**
  - Server limits: 20 joins per IP per minute (pkubdcard value); 5 failures per channel → lock; ≤ 5 open channels per device; TTL 60 s–24 h (default 15 min); frames ≤ 4 KB at ≤ 60 per minute.
  - The sharer sees every join and every issued code in real time and can revoke with one tap.
- **Honest residual risk.** Web viewers run JavaScript served by the relay, so a malicious operator could serve a page that leaks `k`. That exposes **codes during the share window, bounded by the spend cap**, not the JWT. This is the same caveat as pkubdcard's "信任模型", but the stakes are much smaller. Mitigations:
  - The page is static and built reproducibly from the plugins repo, with a strict CSP (`connect-src 'self'`) and SRI.
  - App viewers decrypt natively through a deep link and never run relay JavaScript.

---

## 2. The plugin backend standard ("PKU Harness Cloud")

### 2.1 Principles
1. **Serverless from the user's trust perspective.** The default server is a blind router and store. Plaintext leaves the device only for things a plugin declares in plain words, and the user approves it.
2. **No campus identity in the cloud.** The identity is a device keypair. The server never learns the student ID or name.
3. **One contract, many providers.** Official, self-hosted or BYO; plugins can't tell which.
4. **Per-plugin isolation is enforced by the host, not by trust.** `HostServices` today is one shared object without caller identity (see the comment in `src/core/services.ts` above `otp`). So cloud access is **bound per plugin** and passed beside `kv`, never inside `services`.
5. **The agent sees tools, never cloud credentials, tokens or share links.**

### 2.2 SDK (`plugins/packages/sdk/src/cloud.ts`, new)

```ts
export type CloudService = 'store' | 'channels' | 'push' | 'files' | 'functions';

export interface CloudManifest {
  protocol: 1;
  uses: CloudService[];
  /** Plain-language lines shown in the consent sheet: exactly what leaves the device. */
  disclosure: { zh: string[]; en?: string[] };
  /** All store/channel payloads are client-encrypted; the host refuses plaintext writes when true. */
  e2e: boolean;
  /** Plugin still works without cloud; features check ctx.cloud.available. Else requires 'cloud'. */
  optional?: boolean;
  /** Server functions: run on the user's provider (code in plugins/<id>/server) or an external URL. */
  functions?: Record<string, CloudFunctionDecl>;
  backend?: { kind: 'provider' } | { kind: 'external'; url: string };
  /** Static pages from plugins/<id>/web served at /w/<plugin>/<page> (viewers without the app). */
  pages?: string[];
}
export interface CloudFunctionDecl<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  title: string; input: I; output: O; version: number; timeoutMs?: number;
}

/** Opaque: can only be shown via host.shareLink() or <QRCode link>. JSON.stringify → "[secret link]". */
export interface SecretLink { readonly kind: 'secret-link'; readonly channelId: string; toJSON(): string }

export interface PluginCloud {
  readonly available: boolean;
  status(): { provider: 'official' | 'custom' | 'off'; baseURL?: string; consented: boolean; online: boolean };
  store: {
    get<T>(key: string): Promise<{ value: T; version: number } | undefined>;
    put<T>(key: string, value: T, opts?: { ifVersion?: number; ttlS?: number }): Promise<{ version: number }>;
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<{ key: string; version: number; updatedAt: number }[]>;
  };
  channels: {
    open(opts: { ttlS: number; maxPeers?: number; page?: string; meta?: unknown /* sealed */ }): Promise<Channel>;
    get(id: string): Channel | undefined;           // survives app restart (keys in SecureStore)
    list(): Channel[];
  };
  push: { /* stage 6 */ schedule(at: number, payload: unknown): Promise<string>; cancel(id: string): Promise<void> };
  functions: { invoke<N extends string>(name: N, input: unknown, opts?: { signal?: AbortSignal }): Promise<unknown> };
}
export interface Channel {
  id: string; expiresAt: number; link: SecretLink;
  peers(): { id: string; joinedAt: number }[];
  on(ev: 'join' | 'leave' | 'message' | 'closed', fn: (e: ChannelEvent) => void): () => void;
  send(peerId: string | '*', msg: unknown): Promise<void>;  // sealed per peer
  /** Sealed blobs readable by peers while the owner is offline (batch mode). */
  mailbox: { put(slot: string, msg: unknown, ttlS: number): Promise<void>; clear(): Promise<void> };
  extend(ttlS: number): Promise<void>;
  close(): Promise<void>;
}
export type CloudErrorCode = 'not_configured' | 'consent_required' | 'offline' | 'rate_limited' | 'quota' | 'gone' | 'protocol' | 'server';
export class CloudError extends Error { constructor(readonly code: CloudErrorCode, msg: string, readonly retryAfterS?: number) { super(msg); } }
export function defineCloudFunction<I extends z.ZodType, O extends z.ZodType>(d: CloudFunctionDecl<I, O>) { return d; }
```

Edits to `plugin.ts`:
- `PluginDef.cloud?: CloudManifest`.
- `Capability` gains `'cloud'`.
- `ToolContext.cloud: PluginCloud`.
- `HostServices.ongoing.start({ title, body, until, stopLabel }) → { update, stop }`: an Android foreground service. A new capability `'ongoing'` is present only on Android.

Edits to `ui.ts`:
- `PluginScreenProps.cloud` and `PluginWidgetProps.cloud`.
- `HostUI.shareLink(link: SecretLink, opts?: { message?: string })` opens the system share sheet.
- `QRCode` accepts `link?: SecretLink`.

Edit to `registry/schema.ts`: add `cloud: { uses, e2e, disclosure, backend? }` so the marketplace can show "uses cloud" before install. `scripts/validate-registry.ts` requires `disclosure` whenever `uses` is non-empty.

Plugins repo, new packages:
- **`packages/cloud-protocol`** (`@pku-harness/cloud-protocol`): zod wire schemas for every endpoint below, the `Envelope` type (`{ v: 1, n: <24-byte nonce b64>, c: <ciphertext b64> }`) and the crypto helpers. It uses `@noble/curves` (Ed25519, X25519), `@noble/hashes` (HKDF, SHA-256) and `@noble/ciphers` (XChaCha20-Poly1305): pure JavaScript, audited, and working on Hermes, in WeChat's webview and on Bun. App, server and viewer pages all import **the same file**, so encryption cannot drift between them.
- **`plugins/shared/campus-card.ts`**: the code-fetch, mode and turnover helpers moved out of `wallet/src/card/api.ts`, so `wallet` and `card-share` share them through a relative import (code shared by bundled plugins lives in `plugins/shared/`, not in a new package). No app config is needed.

### 2.3 Wire protocol v1 (served by every provider)

| Method / path | Auth | Purpose |
|---|---|---|
| `GET /v1/meta` | none | `{ protocol: 1, services: [...], limits, pages: [...], functions: [{plugin, name, version}], operator: {name, contact, privacyURL} }` |
| `POST /v1/devices` | PoW | `{ signPub, boxPub, pow }` → `{ deviceId }` (proof of work ≈ 1 s on a phone; anti-farming) |
| `POST /v1/auth/token` | Ed25519-signed challenge | `{ deviceId, plugin, services, ts, nonce, sig }` → 10-min bearer `{ token }` with claims `sub=deviceId, plg=<plugin>, svc=[...]` |
| `DELETE /v1/devices/me` | device | Wipe all data of this device (Settings → 删除云端数据) |
| `GET/PUT/DELETE /v1/store/:key`, `GET /v1/store?prefix=` | plugin token | KV namespaced by `(deviceId, plg)` from the token, never from the path. Values are envelopes when `e2e`. Supports `If-Match` versions and `ttl`. |
| `POST /v1/channels` | plugin token | `{ ttlS, maxPeers, joinHash, meta: Envelope, chanPub }` → `{ id, expiresAt }` |
| `PATCH/DELETE /v1/channels/:id` | owner | Extend or close |
| `GET /v1/channels/:id/ws` | owner | Owner WebSocket: join, leave, peer frames in; frames out |
| `PUT/DELETE /v1/channels/:id/mailbox/:slot` | owner | Batch-mode sealed blobs |
| `GET /v1/c/:id` | public, rate-limited | `{ status, meta: Envelope, chanPub, expiresAt }` |
| `POST /v1/c/:id/join` | `authKey` | `{ authKey, peerPub }` → `{ peerToken }` (claim; maxPeers enforced) |
| `GET /v1/c/:id/ws?t=` (plus SSE `GET /v1/c/:id/events` and `POST /v1/c/:id/send` fallback for webviews without WebSocket) | peer token | Peer frames |
| `GET /v1/c/:id/mailbox` | peer token | Batch-mode blobs |
| `POST /v1/fn/:plugin/:name` | plugin token | Server function (stage 6) |
| `POST /v1/push/tokens`, `POST/DELETE /v1/push/schedule` | plugin token | Stage 6 |
| `GET /s/:id` | none | 302 to `/w/<plugin>/<page>#…`. The page records the plugin at open time. |

Rate limits are token buckets per `(deviceId, plugin, service)` plus per IP. Responses carry `RateLimit-*` headers, and a 429 becomes `CloudError('rate_limited', retryAfterS)`. Default quotas:
- store: 1 MB and 1,000 keys per plugin per device
- channels: 5 open per device, 24 h max TTL
- push: 100 pending schedules
- functions: 60 calls per minute

### 2.4 Providers and settings
- **Settings → 云服务** (`src/app/cloud-settings.tsx`, `src/screens/settings/cloud.tsx`), modelled on `screens/settings/ai.tsx`. Options:
  - **官方** (our instance; default off until the user opts in during onboarding or at first use)
  - **自建** (base URL field, then "测试连接" shows the `/v1/meta` operator, services and limits)
  - **关闭**
- The screen also shows the device identity fingerprint (first 8 words of `sha256(signPub)`), "重置身份" and "删除云端数据".
- URL rule: https only. `http://10.0.2.2:*` and `http://localhost:*` are allowed in `__DEV__`; the debug network config already allows cleartext (`config-plugins/with-debug-user-ca.js`).
- `HOST_CAPABILITIES` (`src/core/runtime/registry.ts`) becomes reactive: `'cloud'` is present when a provider is configured. Plugins with `requires: ['cloud']` then get the existing "unavailable" explanation for free.

### 2.5 Consent and permissions
- On the plugin detail page (`src/screens/plugins/detail.tsx`), a new **云端** section (`src/screens/plugins/cloud-section.tsx`) shows:
  - the provider host
  - the `disclosure` lines
  - an E2E badge
  - the services the plugin uses
  - usage against quota
  - a "允许使用云服务" switch
  - "清除此插件云端数据"
- Grants live next to per-effect modes in `src/core/runtime/plugin-settings.ts` (`cloud: { granted: boolean, at }`).
- When an uncon­sented plugin uses cloud, the bound client throws `CloudError('consent_required')`. Screens call `host.requestCloudConsent()`, which uses the same sheet pattern as `approvals.ts`. The agent gets a tool error telling the user where to allow it.
- **External backends** (`backend.kind = 'external'`): the consent sheet names the foreign host. Requests carry a **pairwise pseudonym**, `HKDF(deviceSignPriv, origin)`, so different backends cannot correlate one user.

### 2.6 Where server code runs (three tiers)
1. **Standard services.** store, channels, mailbox, push and files are implemented by every conforming server, with no plugin code on it. card-share needs only these. This is the tier we push authors toward.
2. **Provider functions.** Code lives in `plugins/<id>/server/*.ts`, exporting `defineCloudFunction` handlers that receive `{ input, store, fetch }`. The `fetch` is limited to an allowlist declared in the manifest. Handlers are reviewed in the plugins repo, like bundled plugins.
   - v1 runs them in Bun `Worker`s with time and memory limits. That limits damage but is not a sandbox; trust comes from review.
   - Stage 7 moves unreviewed community functions to **workerd** isolates, the open-source Cloudflare runtime with capability bindings.
   - Contracts (`plugins/<id>/src/cloud/contract.ts`) are imported by both the plugin and its server code, so a zod change is a type error on both sides.
3. **External backends.** Any URL speaking the Cloud protocol (for tool-shaped services, the existing remote MCP plugins in `src/core/runtime/remote.ts`). Declared in the manifest and approved by the user.

Versioning:
- Protocol `/v1`. `meta.protocol` is checked at connect.
- A function is `name@version`. The server keeps the previous major for 90 days.
- A manifest whose `uses` isn't in `meta.services` marks the plugin unavailable, with the reason "当前云服务不支持 channels".

### 2.7 Offline behaviour
- `available` follows provider, consent and reachability.
- store reads fall back to a local mirror (SQLite `cache`). Writes need the network and fail with `offline`; there is deliberately no silent outbox in v1.
- channels reconnect with backoff on `AppState` foreground and network change. Peers see "分享者暂时离线", and batch-mode mailbox blobs keep working.
- functions fail fast with `offline`.

### 2.8 How the agent sees it
- The agent sees only plugin tools. Tool results pass through the existing invoke path (`src/core/runtime/invoke.ts`).
- `SecretLink.toJSON()` redacts. As a second guard, the host scrubs strings matching `/\/s\/[A-Za-z0-9_-]+#k=/` from tool outputs and logs.
- Tokens and keys live only in `src/core/cloud/*` and SecureStore. Plugins never see bearer tokens; the bound client signs requests itself.

---

## 3. Where the code goes

### 3.1 Reference server: `plugins/packages/cloud-server` (`@pku-harness/cloud-server`)

Reasons for this location:
- Plugin authors write `server/` and `web/` in the same workspace and run the server with `bun run --filter @pku-harness/cloud-server dev`.
- The server imports `cloud-protocol` and the plugins' `server/` and `web/dist` directly, with no extra submodule.

Stack: **Bun + Hono + `bun:sqlite` (WAL)**. Postgres comes later behind a `Storage` interface. Litestream handles backups. We pick Bun over porting pkubdcard's Go because one zod contract then serves app, server and viewer.

Layout:

```
packages/cloud-server/
  src/index.ts            Bun.serve + Hono app, websocket upgrade
  src/routes/{meta,devices,auth,store,channels,peer,mailbox,pages,fn,push}.ts
  src/auth/{token.ts,pow.ts,sig.ts}
  src/db/{schema.sql,storage.ts,sqlite.ts}
  src/limits.ts           token buckets (port of pkubdcard rateLimiter, generalised)
  src/channels/hub.ts     in-memory socket registry + GC loop (pkubdcard share.gcLoop)
  src/pages.ts            serves plugins/*/web/dist at /w/<plugin>/*, strict CSP
  src/functions/runner.ts stage 6
  test/*.test.ts          app.request()-based route tests
  deploy/{Dockerfile,Caddyfile,litestream.yml,README.md}
```

### 3.2 Host (`pku-harness/src/core/cloud/`, new)

| File | Role |
|---|---|
| `identity.ts` | Generate and store Ed25519 and X25519 keys (SecureStore `cloud.identity`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`); register with PoW; fingerprint |
| `provider.ts` | Provider config (kv `cloud`), `/v1/meta` cache, reactive store, the `'cloud'` capability |
| `client.ts` | Token minting and cache per plugin, `expo/fetch`, retries, mapping errors to `CloudError` |
| `crypto.ts` | Thin wrapper over `@pku-harness/cloud-protocol` (randomness via `expo-crypto` `getRandomValues`, polyfilled in `src/polyfills.ts`) |
| `store.ts`, `channels.ts`, `push.ts`, `functions.ts` | Service implementations; channel keys persisted per channel in SecureStore |
| `bind.ts` | `cloudFor(pluginId): PluginCloud`, which enforces consent, manifest `uses` and `e2e` |
| `secret-link.ts` | `SecretLink` class, link parse and build, output scrubber |
| `consent.ts` | Grant state, `requestCloudConsent` UI bridge |
| `ongoing.ts` | `services.ongoing` on notify-kit `asForegroundService` |

Wiring:
- `invoke.ts` adds `cloud: cloudFor(entry.pluginId)` to `ToolContext`.
- `screens/plugins/screen-host.tsx` and `core/host-ui.tsx` (widgets) pass `cloud` as a prop.
- `services.ts` adds `ongoing`.
- `app.json` adds the foreground service type `dataSync` next to `shortService`.
- Deep link `pkuharness://share/<id>#k=…` and https App Links for the official domain route to `/m/card-share/view`.
- Data export excludes keys. Full reset calls `DELETE /v1/devices/me` before wiping.

### 3.3 `card-share` plugin (`plugins/plugins/card-share/`)

```
src/index.ts            definePlugin: id 'card-share', name '付款码共享', requires ['campus-session','network','cloud'],
                        cloud: { protocol:1, uses:['channels'], e2e:true, pages:['view'],
                          disclosure:{ zh:['分享期间，加密后的付款码经云服务转发给你分享的人；服务器无法解密',
                                           '服务器能看到：分享的开始/结束时间、查看者的 IP'] } },
                        defaultModes: { read:'auto', write:'auto', money:'ask' }
src/source.ts           CodeSource interface: real (via plugins/shared/campus-card.ts) + mock (dev/tests)
src/session.ts          ShareSession: channel ↔ code loop, gates (PIN, masked name), spend cap, events, persistence (kv)
src/cap.ts              spend-cap evaluation over turnover records (pure, tested)
src/protocol.ts         zod frames: want | code{code,issuedAt,seq,balance?} | gate{pin|name} | gate_result | revoked | status
src/screens/create.tsx  modal: TTL presets (10 min / 30 min / 2 h / 今天), ¥ cap, 姓名验证 (tap chars to hide, port of pkubdcard),
                        PIN, 允许人数 → host.shareLink + QR
src/screens/active.tsx  live status: countdown, viewer joined, codes issued, spend so far, 停止 / 延长 / 重置查看者
src/screens/view.tsx    in-app viewer (deep link): native QRCode, useSecureDisplay({brightness:true})
src/tools.ts            cardShare.list (read), cardShare.revoke (write), cardShare.start (money: opens create sheet
                        prefilled, returns {status:'awaiting_user'}; never the link)
web/                    Vite + Preact + Tailwind, ported from pkubdcard/web/src (UseFlow.tsx, ui.tsx, wakelock.ts,
                        atmosphere.tsx); imports @pku-harness/cloud-protocol for crypto; build → web/dist
*.test.ts               cap, gates, frame schemas, session state machine with mock source + fake channel
```

**Sharer flow**
1. 付款码 screen or wallet hub → "分享给朋友". If card-share is installed and enabled, this navigates to `/m/card-share/create`.
2. The create sheet asks for cloud consent once if needed.
3. `channels.open({ ttlS, maxPeers: 1, page: 'view', meta: seal({ nameHint, pinRequired, cap }) })`.
4. `services.ongoing.start(...)`, then the share sheet (WeChat) or a QR on screen.
5. While the share runs:
   - On peer join → notification "有人打开了你的分享".
   - Gates are checked on the device.
   - Codes are pushed every 25 s, or on `want`.
   - The spend cap is polled.
6. Auto-close on expiry, cap, revoke or 5 gate failures. Summary: "本次共享消费 ¥18.50（2 笔）" with the transactions.

**Viewer flow (no app)**
1. Opens the link: `GET /s/:id` → `/w/card-share/view#k=…`. The page reads `#k` and fetches `/v1/c/:id`.
2. It decrypts meta, shows "王_明" and PIN prompts, joins, then gets the code stream, sends gate answers and renders a large QR with a countdown ring and wake lock (as in pkubdcard).
3. States: 分享者离线 / 已撤销 / 已过期. A banner offers to open in the app if it is installed.
4. **Must work inside the WeChat webview**: SSE fallback, no WebCrypto dependency (noble).

**Relation to wallet**
- wallet keeps the own-code screen and never needs cloud consent (least privilege).
- Its code helpers move to `plugins/shared/campus-card.ts`, which both plugins import.
- Payment codes remain never-a-tool-result in both plugins.

---

## 4. Staged implementation plan (small commits)

Plugins-repo commits land and get pushed first; then the submodule is bumped in the app (AGENTS.md).

**S0 Spike (no merge). Payment-code facts.** Add a temporary action to the dev runner (`src/app/dev.tsx`) that logs `barcode.length`, code length and format, and fetch times. The user tests at a real till:
- codes aged 30 s, 60 s, 2 min, 5 min and 15 min
- an old code used after a new one was fetched
- the same code used twice

Record the results in `docs/CLOUD.md`. This decides whether batch mode and one-shot mode exist.

**Stage 1. Contracts (plugins repo)**
1. `feat(cloud-protocol): wire schemas and envelope crypto`, with tests: seal/open round trip, HKDF vectors, tamper rejection.
2. `feat(sdk): cloud manifest, PluginCloud, SecretLink, 'cloud'/'ongoing' capabilities`. Types only, plus `CloudError`.
3. `feat(registry): cloud field + disclosure validation`.

**Stage 2. Reference server**
4. `feat(cloud-server): meta, device registration (PoW), signed token auth, SQLite`.
5. `feat(cloud-server): rate limits and quotas`.
6. `feat(cloud-server): channels (owner ws, public info, join/claim, peer ws + SSE, GC)`.
7. `feat(cloud-server): mailbox + static plugin pages with CSP`.
8. `feat(cloud-server): store`. card-share doesn't need it; it proves the generic API.

**Stage 3. Host**
9. `feat(cloud): identity, provider config, client` plus the Settings → 云服务 screen with connection test.
10. `feat(cloud): per-plugin binding, consent section and prompt, reactive 'cloud' capability`.
11. `feat(cloud): channels client with reconnect, SecretLink, host.shareLink, QRCode link`.
12. `feat(host): services.ongoing foreground service (dataSync)`.

**Stage 4. card-share**
13. `refactor(wallet): extract plugins/shared/campus-card.ts`. Pure move; wallet tests stay green.
14. `feat(card-share): session engine with mock source + tools`.
15. `feat(card-share): create / active / in-app view screens`.
16. `feat(card-share): web viewer (port of pkubdcard UseFlow)`.
17. `feat(card-share): spend cap, PIN and masked-name gates, notifications`.
18. `feat(wallet): 分享给朋友 entry`, then registry entry and docs (new `docs/CLOUD.md`, ARCHITECTURE §4/§13, PLAN M13).
19. Only if S0 allows: `feat(card-share): batch mode via mailbox`, then the one-shot share.

**Stage 5. Deploy.** Dockerfile, Caddy and Litestream; our instance; onboarding offers 云服务 as an optional step.

**Stage 6. push and functions.**
- push uses UnifiedPush (ntfy) on Android, APNs on iOS and optional FCM. Payloads are E2E envelopes.
- `push.schedule` gives iOS exact-time wakes for scheduled checks: the server knows the timing only, and the check still runs on the device. This resolves the open question in `docs/IOS.md`.
- Bun-Worker function runner.

**Stage 7.** workerd isolates for unreviewed community functions; files; external-backend pseudonyms; multi-device pairing.

### Local testing
- **Server:** `cd plugins/packages/cloud-server && bun run dev` (port 8787; set `CLOUD_PUBLIC_URL` to the origin clients use). bun tests drive Hono `app.request()` and real WebSockets on an ephemeral port.
- **Emulator:** Settings → 云服务 → 自建 `http://10.0.2.2:8787` (debug cleartext is already allowed). Turn on the card-share **mock source** (dev toggle in the plugin's settings row). Then:
  1. Create a share on `emulator-5554`.
  2. Read the link from the share sheet or with `adb logcat` in dev builds only.
  3. Open `http://localhost:8787/s/<id>#k=…` in host Chrome (chrome-devtools MCP).
  4. Verify the QR, the gates, revoke on the phone → "已撤销", app backgrounded with the foreground-service notification still streaming, and expiry.
  5. Use mobile-mcp for screenshots in both themes.
- **Unit:** `cloud-protocol` crypto; `cap.ts` with turnover fixtures; gate lockout; session state machine with a fake channel and fake clock; `secret-link` scrubber; `bind.ts` consent and `e2e` enforcement; registry validation.
- **Integration script** `packages/cloud-server/test/e2e-share.test.ts`: a simulated device (the real `card-share` session against a Node keystore) plus a simulated viewer (the web viewer's protocol module). It checks:
  - claim and second-joiner rejection
  - PIN lockout
  - revoke
  - TTL GC
  - that the server DB and logs never contain a plaintext code: grep the SQLite file and captured logs for the mock code
- **Real account (user):** one live share at a canteen till, with a ¥ cap, after S0.

---

## 5. Decisions for you (recommended default in bold)

1. **Who hosts the official instance and where.** Mainland hosting needs ICP filing; Cloudflare is slow in China. **A pkuinfo-run Hong Kong or Tokyo VPS; BYO always available; revisit a campus-hosted node via a student organisation.**
2. **Domain.** A short domain for links plus App Links, for example `pkuinfo.cn/s/…` or `s.pkuinfo.org`. WeChat may interstitial or block unknown domains. **Buy a dedicated short domain, test it in WeChat early, and always offer QR plus copy link.**
3. **Repo location.** **`plugins/packages/{cloud-protocol,cloud-server}`**, against a new `pkuinfo/pku-harness-cloud` repo.
4. **Stack.** **Bun + Hono + SQLite**, against reusing pkubdcard's Go (Gin).
5. **Share credential.** A 6-digit 口令 like pkubdcard cannot carry the key, and the server could brute-force a key derived from it. **Link and QR only.**
6. **Android foreground service type.** **`dataSync`** (Android 15 caps it at 6 h/day, enough for shares), against `specialUse`, which needs a Play justification.
7. **Community server code.** **Reviewed-only Bun Workers in v1, workerd later.** Unreviewed code goes to external backends.
8. **Device anti-abuse.** **PoW plus quotas, no app attestation.** Attestation would break BYO and self-built APKs.
9. **Push provider.** **None in v1** (live mode holds a socket); later **UnifiedPush (ntfy) + APNs**, with FCM optional.
10. **Policy.** Card sharing may conflict with 《北京大学一卡通管理办法》. **Keep pkubdcard's disclaimer in the create sheet and ToS; show the spend cap by default (¥50).**

### Critical Files for Implementation
- /home/wjsoj/Desktop/pku-info/pku-harness/plugins/packages/sdk/src/plugin.ts
- /home/wjsoj/Desktop/pku-info/pku-harness/src/core/runtime/invoke.ts
- /home/wjsoj/Desktop/pku-info/pku-harness/plugins/plugins/wallet/src/card/api.ts
- /home/wjsoj/Desktop/pku-info/pkubdcard/internal/api/api.go
- /home/wjsoj/Desktop/pku-info/pkubdcard/web/src/UseFlow.tsx