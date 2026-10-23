# Design: plugin server functions (PKU Harness Cloud, part 2)

Status: proposal, 2026-10-23. Builds on [CLOUD.md](CLOUD.md) (protocol v1: devices, tokens,
store, channels, mailbox, pages) and [PLUGIN-LANGUAGE.md](PLUGIN-LANGUAGE.md) (plugins as
interpreted `PLUGIN.md` documents). Replaces the "stage 6 functions" sketch in CLOUD.md §2.6.

## 0. Summary

- **A plugin's server side is part of its `PLUGIN.md`.** A `server:` section declares functions,
  schedules, shared collections, secrets it needs and the hosts it calls. Same YAML steps and
  expressions as tools. No uploads, no containers, no JavaScript.
- **The cloud server runs the same interpreter as the app** (`@pku-harness/sdk` `lang/run.ts`),
  with a server set of abilities instead of the phone's. A plugin can only do what its document
  declares, on the server exactly as on the phone.
- **The server runs exactly the version the user approved.** Calls carry the document's content
  hash; the server fetches the document by its link, checks the hash, compiles and caches it. An
  operator policy decides which plugins may run at all (official instance: verified plugins).
- **Users stay anonymous and plugins stay apart.** A plugin sees a per-plugin pseudonym of the
  device, never the device key, the student ID or another plugin's data. Campus credentials never
  reach the server; campus-network services stay on the phone.
- **What it unlocks:** shared data between users (crowd reports, reviews, group lists), always-on
  jobs (poll a public site, push the user at an exact time, also on iOS), public endpoints and
  webhooks, third-party APIs with keys the user never handles, and realtime between users.

## 1. Why the interpreter, not uploaded code

| | Interpreted `server:` (chosen) | Uploaded JS in isolates | Author-hosted backend |
|---|---|---|---|
| What can a malicious plugin do | Misuse what it declared, inside quotas | Anything the isolate allows; needs a hardened runtime (workerd) and review | Anything with the data sent to it |
| Review | Read the document (the same one the user installs) | Read code | Trust the author |
| Operator cost | One process, a worker pool | A separate runtime, per-plugin isolation | None |
| Author effort | Same language as tools | A second language and toolchain | Run a server |
| Testing | `plugin test` replays fixtures, same as tools | Separate | Separate |

General code is still possible through **author-hosted backends** (§9), which the user approves
by host name, as for remote MCP plugins today.

## 2. The `server:` section

```yaml
---
spec: 1
id: canteen-crowd
name: 食堂人流
# … tools, widgets as today …
server:
  network: [api.qweather.com]          # hosts server steps may call (HTTPS)
  secrets: [QWEATHER_KEY]              # set by the operator; usable only in request templates
  collections:
    reports:                           # shared between all users of this plugin
      scope: plugin                    # plugin | user | group
      schema: { canteen: string, level: { enum: [low, mid, high] }, at: number }
      ttl: 2h                          # rows expire
      write: { perUser: 20/h }         # rate limit per pseudonym
  functions:
    report:
      effect: write
      access: user                     # user | peer | public | webhook
      input: { canteen: { enum: [学一, 学五, 农园, 燕南] }, level: { enum: [low, mid, high] } }
      steps:
        - collection: reports.add
          value: "{ canteen: input.canteen, level: input.level, at: now }"
      return: "{ ok: true }"
    crowd:
      effect: read
      access: public
      cache: 30s
      steps:
        - let: rows
          collection: reports.query
          where: "r => r.at > now - 3600000"
      return: "groupBy(rows, r => r.canteen)"
  schedules:
    morning:
      cron: "30 7 * * 1-5"             # Beijing time
      for: each-user                   # each-user (who enabled it) | once
      steps:
        - let: wx
          request: { url: 'https://api.qweather.com/v7/weather/now', query: { key: '${secrets.QWEATHER_KEY}', location: '116.31,39.99' } }
          as: json
        - if: "wx.now.precip > 0"
          then:
            - push: { title: 下雨了, body: '记得带伞，今天去{{…}}' }
---
```

### 2.1 Fields

| Field | Meaning |
|---|---|
| `network` | Public hosts server steps may call. HTTPS only, same rules as tool requests. Shown to the user. |
| `secrets` | Names of operator-held secrets (API keys). Values never leave the server: they are only substituted into request URL/query/headers/body, never bound to a variable, logged or returned (the interpreter refuses `secrets.*` outside request templates). |
| `collections` | Server-side data (§4). |
| `functions` | Named server functions (§3). Same shape as a tool: `effect`, `input`, `constants`, `functions`, `steps`, `return`, plus `access` and `cache`. |
| `schedules` | Jobs the server runs on a timetable (§5). |
| `pages` | Static web pages served at `/w/<plugin>/` (exists today, CLOUD.md). |
| `limits` | Optional lower limits than the operator defaults. |

The `cloud` manifest of CLOUD.md (`uses`, `e2e`, `disclosure`) is derived: a plugin with a
`server:` section uses `functions`; `disclosure` stays required and is what the user reads.

### 2.2 Calling a server function

- **From a tool** (phone): a new step `- let: r` / `cloud: { fn: crowd, input: {…} }`. The
  step needs the `cloud` capability and the user's consent for the plugin, as all cloud use does.
- **From a screen or widget**: bindings may name a server function the same way they name a tool
  (`{ fn: crowd }`); widgets can show shared data without a phone-side tool.
- **From the web**: `access: public` functions are `GET/POST /v1/p/<plugin>/<fn>` (no token,
  rate-limited per IP), so a plugin's own web page (or anyone) can read them.
- **From outside**: `access: webhook` functions get a per-install secret URL
  `/v1/hook/<plugin>/<fn>/<token>` for services that push events.

## 3. Functions

### 3.1 Access levels

| `access` | Who may call | Caller identity in scope |
|---|---|---|
| `user` | A device that installed the plugin and consented (plugin token) | `caller.id` = pseudonym (§6) |
| `peer` | A viewer joined to one of the owner's channels | `caller.peer`, `caller.owner` pseudonyms |
| `group` | Members of a group (§4.2) | `caller.id`, `group.id` |
| `public` | Anyone | none; per-IP limits; read effect only |
| `webhook` | Holder of the hook URL | `hook.owner` pseudonym |

`public` and `webhook` functions may not have `money` or `public` effects. A function's effect is
checked like a tool's: calls from the agent go through `invokeTool` on the phone first (the
phone-side `cloud` step inherits the tool's effect and permission mode).

### 3.2 Server abilities (the server's instruction set)

| Ability / step | Does | Notes |
|---|---|---|
| `request` | HTTPS to `server.network` hosts | ≤ 2 MB, ≤ 20 per run, secrets templating |
| `collection` | `add get query update remove count` on declared collections | scoped, schema-checked, quota'd |
| `kv` | per-pseudonym key-value (existing store, namespaced per plugin) | same as phone `kv` but server-side |
| `push` | Notify a user: `{ to?: pseudonym, title, body, data? }` | defaults to the caller / schedule user; delivered via the user's push channel (§5.2) |
| `channel.publish` | Send to a channel the owner opened | for realtime between users |
| `call` | Another server function of the same plugin | depth ≤ 3 |
| `crypto` | `sha256`, `hmacSha256`, `randomId` | request signing |
| `now`, `caller`, `group`, `secrets` | read-only scope values | `secrets` only inside request templates |

Not available on the server: `campus` requests, phone abilities (`todos`, `timetable`, `browser`,
`sms`, `otp`, files), anything about the device.

### 3.3 Limits per run (operator defaults)

≤ 100 steps, ≤ 20 requests, ≤ 10 s wall time (schedules: 30 s), ≤ 50 000 expression operations,
≤ 256 KB result, ≤ 64 KB input. Per plugin per day (official instance): 50 000 calls, 20 000
outbound requests, 5 000 pushes, 50 MB collection storage. Exceeding returns `rate_limited` /
`quota` (CLOUD.md error codes) and is shown to the author (§8).

## 4. Collections

### 4.1 Scopes

- `scope: user` — rows belong to the caller's pseudonym; only they read or change them. For data
  that should follow the user to the server (a synced list, a schedule's state).
- `scope: plugin` — one shared table for all users of the plugin (crowd reports, ratings,
  lost-and-found). Every row records its author pseudonym; `update`/`remove` only by the author
  unless the function is `effect: write` with `moderate: true` and called by the plugin's
  maintainers (§8). Rows are plaintext: the disclosure must say what is shared.
- `scope: group` — rows visible to the members of one group (§4.2).

Each collection declares a `schema` (same field syntax as tool input), optional `ttl`, an index
list (`index: [canteen, at]`, ≤ 3) and write rate limits. `query` takes a filter expression,
`sort`, `limit` (≤ 500) and runs over the index first; it is bounded like any step.

### 4.2 Groups

A small shared space (a dorm's expense split, a study group's notes): created by a user, joined
by invite link (a channel-style secret link, CLOUD.md §1.3). With `e2e: true` the group key is
shared through the invite fragment, rows are envelopes, and the server functions can only count,
order and forward them, never read them (the interpreter treats envelope fields as opaque).

### 4.3 Storage

SQLite (one table per collection with JSON rows + generated index columns) on the reference
server; Postgres behind the same `Storage` interface for larger instances. Litestream backups
as today.

## 5. Schedules and push

### 5.1 Schedules

`cron` (Beijing time, minute precision) or `every: 15m` (≥ 5 m). `for: once` runs one job for the
plugin; `for: each-user` runs once per user who enabled it, with `caller.id` set to that user and
their per-user args (the phone sends `{ args }` when enabling, e.g. which canteen). Jobs are
queued with jitter ≤ 30 s, run on the worker pool, and retried twice on failure. Users see and
switch them off in the plugin's page (and in the app's scheduler list, as server jobs).

This answers the open question in CLAUDE.md ("exact-time background checks need a server"): the
server keeps time, the phone only receives the result.

### 5.2 Push delivery

A device registers push channels with the server (`POST /v1/push/tokens`, CLOUD.md): FCM on
Android with Google services, **UnifiedPush/ntfy** on Android without them, APNs on iOS. A push
is `{ title, body, data }`; with `e2e` plugins the body is an envelope the app decrypts in a
notification service extension (iOS) or on receipt (Android), so the push provider sees nothing.
If a push can't be delivered, it is kept in the user's mailbox and shown on next app open.

## 6. Identity and privacy

- **Pseudonyms**: `caller.id = base64url(HMAC(serverSecret, "pseudonym" ‖ plugin ‖ deviceId))[:22]`.
  Stable per (device, plugin); two plugins can't correlate the same user; the device key never
  appears in plugin scope.
- **No campus identity**: functions never get a student ID, name or campus session. A plugin that
  wants a display name asks the user in its UI and stores it in its own collection (visible to
  the user as shared data).
- **Disclosure**: the plugin page and the install sheet list, from the document: server host,
  what is sent (function inputs), what is shared with other users (`plugin`/`group` collections),
  outbound hosts, schedules. The user's cloud consent covers exactly that version (§7); wider
  declarations in an update wait for approval, as for tools.
- **Data rights**: "Clear this plugin's cloud data" deletes the user's `user`-scope rows, KV,
  schedules and their authored `plugin`-scope rows; "Delete cloud data" does it for every plugin.

## 7. Which code runs: hashes and operator policy

1. When the user consents, the phone records the document's content hash (already stored by the
   install store, PLUGIN-LANGUAGE §10).
2. The plugin token (CLOUD.md `POST /v1/auth/token`) gains a `doc` claim: `{ link, hash }`.
3. On the first call for a hash, the server fetches the document from the link, recomputes the
   hash (must match), validates and compiles it, and caches `(plugin, hash) → compiled` (LRU).
   Schedules are registered per hash; a user who hasn't accepted an update keeps running the old
   hash until the server's retention (30 days), then their jobs pause with a notice.
4. **Operator policy** (`CLOUD_FN_POLICY`):
   - `verified` (official instance): only plugins on the registry's verified list, at hashes the
     registry pins after review.
   - `allowlist`: plugins/hashes listed by the operator.
   - `open` (local dev, self-hosted for a group): any document.
   `/v1/meta` advertises the policy so the app can explain "this server doesn't run community
   plugins' server functions" instead of failing silently.

## 8. Authors and operations

- **Local**: `plugin run --server <dir> <fn> <json>` and `plugin test` replay fixtures for server
  functions and schedules with a fake clock, fake collections and recorded responses (same as
  tools). `bun run dev` in `packages/cloud-server` with `CLOUD_FN_POLICY=open` serves any local
  folder (`CLOUD_FN_LOCAL=../../plugins`).
- **Logs**: per plugin, structured, redacted (no inputs, no secrets, no pseudonyms in clear),
  kept 24 h. Authors read them with `plugin logs <id>` after proving authorship (a signature by a
  key listed in the plugin's frontmatter `maintainers: [ed25519:…]`); operators see all.
- **Metrics**: calls, errors, p95 time, quota use per plugin, exposed at `/v1/meta/plugins/<id>`
  (aggregate only).
- **Moderation**: maintainers' signed calls may run `moderate: true` functions (remove abusive
  shared rows). Operators can suspend a plugin's server section instantly (`/admin`).

## 9. Author-hosted backends (escape hatch)

A plugin that needs general code declares `server: { backend: https://api.example.org }` instead
of functions. The app calls it through the same `cloud` step, adding a pairwise pseudonym
(`HMAC(deviceSignKey, origin)`) and the plugin's consent; the install sheet names the foreign
host and says the author runs it. No campus data or credentials are ever forwarded automatically.

## 10. Architecture

```
phone (harness)                       cloud server (Bun)
 ├ invokeTool → tool steps            ├ HTTP API (Hono): /v1/fn, /v1/p, /v1/hook, existing v1 routes
 │   └ cloud step ──────────────────► ├ auth: token (+ doc claim), pseudonyms, policy check
 ├ widgets/screens bind { fn }        ├ doc cache: link + hash → compiled server section
 ├ push receiver (FCM/UnifiedPush/APNs)├ worker pool (Bun Workers, N = cores): runs lang/run.ts
 └ consent + disclosure UI            │    with ServerHost abilities, per-run limits
                                      ├ collections (SQLite/Postgres), kv, quotas
                                      ├ scheduler: cron table → job queue (SQLite) → workers
                                      ├ push: FCM / ntfy / APNs senders, mailbox fallback
                                      └ logs + metrics (per plugin, redacted)
```

The worker pool isolates CPU and memory (a run that hangs is killed by its worker's deadline);
security comes from the instruction set, not the sandbox. Memory per worker is capped
(`--smol`, `resourceLimits`), and the pool size is bounded so the server stays small (target:
the whole server < 300 MB RSS on the 2-core VPS).

## 11. Code locations

| Piece | Where |
|---|---|
| `server:` schema, `cloud` step, server ability table | plugins `packages/sdk/src/lang/` (owner: plugins session), shared by app, server and CLI |
| Server host abilities (`ServerHost`), collections, scheduler, push, doc cache, policy | plugins `packages/cloud-server/src/fn/*` |
| Wire schemas for `/v1/fn`, `/v1/p`, `/v1/hook`, schedules, push tokens | `packages/cloud-protocol` |
| Phone: `cloud` step host binding, `{ fn }` bindings, push registration, schedule UI | app `src/core/cloud/functions.ts`, `push.ts`; plugin page |
| CLI: `plugin run --server`, `plugin logs` | plugins `scripts/plugin.ts` |

## 12. Stages

1. **Spec**: `server:` schema + `cloud` step in PLUGIN-LANGUAGE (plugins session) — this doc's
   §2–§3 as the input.
2. **Server core**: doc cache + policy + `/v1/fn` (`access: user`) + `ServerHost` with
   `request` (+ secrets) and `kv`; worker pool; limits; tests with a fixture plugin.
3. **Collections** (`user`, `plugin` scopes) + `public` access + `/v1/p`.
4. **Phone**: `cloud` step binding, `{ fn }` widget bindings, disclosure lines from `server:`.
5. **Schedules + push** (FCM first; ntfy; APNs with iOS work), mailbox fallback.
6. **Groups** (+ E2E envelopes), webhooks, author logs, moderation.
7. **Reference plugins**: `canteen-crowd` (shared reports), an exam-room notifier (schedule +
   push), card-share unchanged (channels only).

Each stage is small and testable without the emulator: server tests drive Hono `app.request()`
and the worker pool directly; phone pieces are unit-tested; one emulator pass per stage at most.

## 13. Decisions (defaults chosen)

1. Interpreter-only server code on the official instance; JS isolates not planned.
2. Official policy `verified`; self-hosted operators choose.
3. Push: FCM + ntfy on Android, APNs on iOS; payloads E2E for `e2e` plugins.
4. Collections plaintext unless the plugin uses groups with E2E; the disclosure says which.
5. No campus access from the server, ever.
