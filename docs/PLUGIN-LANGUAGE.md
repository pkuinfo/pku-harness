# Design: plugins as shareable documents (the PKU Harness plugin language)

Status: accepted 2026-10-23 (direction set by the maintainer: "a plugin should be like a skill,
but more powerful; we build a language for that; easy to share and use, no package to upload").
Spec version: **1**. Owner: plugins. Related: [ARCHITECTURE.md](ARCHITECTURE.md) §4 (plugin
model), §14 (distribution and updates); [CLOUD.md](CLOUD.md).

## 0. Summary

- **A plugin is a folder with a `PLUGIN.md`**, like a Claude skill's `SKILL.md`. The YAML
  frontmatter is the manifest; the Markdown body tells the agent how to use the plugin. Tools are
  written in a small declarative language (YAML steps + safe expressions); UI is generative-UI
  JSON. No TypeScript, no build, no npm, no app release.
- **Sharing is a link.** Paste `github.com/owner/repo/tree/main/my-plugin` (or any URL of a
  `PLUGIN.md`) into the app, scan a QR code, or tap *Install* in the marketplace. The marketplace
  finds every `PLUGIN.md` in a repo, as skills.sh finds `SKILL.md`.
- **The app interprets; it never runs plugin code.** The interpreter (`@pku-harness/sdk`
  `lang/`) knows a fixed set of operations: call a declared campus service through the user's
  signed-in session, call a declared public host, extract (CSS / JSON / regex), transform, store
  in the plugin's own KV, and call a few host abilities. Every tool still has an effect
  (`read` / `write` / `money` / `public`) and goes through the same permissions, approvals and
  taint rules as today.
- **Humans and the agent author plugins the same way.** "Make me a plugin for the gym booking
  site" ends with a `PLUGIN.md` the user reviews and installs. A plugin is text, so the agent can
  read, fork and fix one.
- **Updates are data.** The app re-fetches an installed plugin's link; a version that asks for
  nothing new applies silently, one that asks for new access waits for the user. App OTA updates
  (ARCHITECTURE §14) are for the harness only.
- **Compiled TypeScript remains only for the harness and host abilities**: IAAA and per-service
  sessions, the payment-code screen, crypto signing, scheduler, dashboard, memory, model
  providers. Campus integrations move to the language over time (§11).

## 1. Goals and non-goals

Goals:
1. Writing a plugin needs a text editor and a link. Reading one needs no programming knowledge
   beyond "this step calls this URL and returns these fields".
2. Safe by construction: a plugin can only do what its manifest declares, and the user sees the
   declaration before installing.
3. Powerful enough for the "easy" and "medium" campus plugins we already have (classrooms,
   campus-events, canteen, notices, grades, course-catalog, elective, library reads, treehole
   tools) without escape hatches.
4. One contract for everything the harness already does with plugins: tools, data sources,
   widgets, screens, Settings rows, commands, agent instructions, i18n.
5. Deterministic and testable: a tool run is a pure function of (input, responses, KV, clock),
   so a plugin can ship recorded fixtures and the CLI can replay them.

Non-goals (v1):
- General-purpose programming. No user-defined loops without bounds, no recursion, no access to
  the device beyond declared abilities, no `eval`, no JavaScript.
- Custom native UI (animations, QR codes, secure screens). Those stay host components that
  plugins reference.
- Server-side code. Plugins that need a server use the Cloud standard (CLOUD.md) or are remote
  MCP plugins.

## 2. A complete example

```
classrooms/
  PLUGIN.md
  tools/free.yaml
  widgets/overview.json
  tests/free.yaml          # optional recorded fixtures
```

`PLUGIN.md`:

```markdown
---
spec: 1
id: classrooms
name: 空闲教室
description: 查询各教学楼今天、明天、后天的空闲教室。
version: 1.2.0
author: pkuinfo
icon: location
network: [portal.pku.edu.cn]
tools:
  free: tools/free.yaml
widgets:
  overview: widgets/overview.json
dataSources:
  overview: { tool: free, args: { day: today }, ttl: 30m }
i18n:
  en:
    name: Free classrooms
    description: Free classrooms in each teaching building, today to the day after tomorrow.
---

Use `free` when the user asks where to study or which rooms are free. Periods are 1–12
(1 = 08:00). Answer with the building and room, and the free period ranges.
```

`tools/free.yaml`:

```yaml
title: 空闲教室
description: Free rooms in one building (or all) for today, tomorrow or the day after.
effect: read
input:
  building: { type: string, optional: true, description: 'e.g. 二教, 理教' }
  day: { enum: [today, tomorrow, after], default: today }
constants:
  BUILDINGS: [一教, 二教, 三教, 四教, 理教, 文史, 地学, 哲学, 国关, 政管]
  ALIASES: { 理科教学楼: 理教, 第二教学楼: 二教 }
  DAYS: { today: 今天, tomorrow: 明天, after: 后天 }
functions:
  freeRanges: "(r) => compactRanges(range(1, 13).filter(i => r['c' + i] == ''))"
steps:
  - let: buildings
    value: "input.building ? [ALIASES[input.building] ?? input.building] : BUILDINGS"
  - let: pages
    each: buildings
    concurrency: 3
    request:
      url: https://portal.pku.edu.cn/publicQuery/ctrl/topic/myTopic/retrClassRoomFree.do
      query: { buildingName: '${item}', time: '${DAYS[input.day]}' }
    as: json
return: "pages.flatMap((p, i) => p.rows.map(r => ({ building: buildings[i], room: r.room, free: freeRanges(r) })))"
```

Installing it: paste `https://github.com/pkuinfo/pku-harness-plugins/tree/main/plugins/classrooms`.

## 3. Files and layout

| Path | Required | What |
|---|---|---|
| `PLUGIN.md` | yes | Frontmatter manifest (§4) + Markdown body = agent instructions |
| `tools/<name>.yaml` | no | One tool each (§5); may also be inline in the frontmatter |
| `widgets/<name>.json` | no | Dashboard widget: generative-UI spec + bindings (§8) |
| `screens/<name>.json` | no | Screen: generative-UI spec + bindings (§8) |
| `tests/<name>.yaml` | no | Recorded fixtures for `plugin test` (§12); never fetched by the app |
| `README.md`, `assets/` | no | For humans / the marketplace; ignored by the app |

Rules:
- Every file the app loads is **named in the frontmatter** (relative path, no `..`). The app never
  lists directories, so any static host works (GitHub, a gist, a self-hosted folder).
- One plugin per folder. A repo may hold many; the marketplace handle is `owner/repo/path`.
- Text files are UTF-8; total size of the files the app loads ≤ 512 KB.

## 4. Manifest (`PLUGIN.md` frontmatter)

Schema: `manifestSchema` in `@pku-harness/sdk` (`packages/sdk/src/lang/manifest.ts`), mirrored
by the website's marketplace scanner.

| Field | Type | Req. | Meaning |
|---|---|---|---|
| `spec` | `1` | yes | Language version. The app refuses specs it doesn't know. |
| `id` | string `^[a-z0-9][a-z0-9-]{1,40}$` | yes | Stable id; tool ids are `<id>.<tool>`. |
| `name` | string | yes | Display name (Chinese first; English in `i18n.en`). |
| `description` | string, 4–200 | yes | One sentence for the plugin list and marketplace. |
| `version` | semver | yes | Shown to the user; updates compare content hashes, not this. |
| `author` | string | yes | GitHub handle or name. |
| `icon` | icon name | no | From the harness icon set. |
| `homepage` | URL | no | Source / docs. |
| `requires` | `Capability[]` | no | `network`, `campus-network`, `campus-session`, `notifications`, `background`, `cloud`, `ongoing`. Derived automatically from `campus`/`network`/`abilities`; listing is optional. |
| `campus` | `CampusService[]` | no | Campus services the plugin may call with the user's session (`card`, `its`, `treehole`, `blackboard`, `elective`, `cwfw`, `cwpay`, `bdkj`, `library`, `library-space`, …). |
| `network` | host[] | no | Public hosts it may call (exact host or `*.example.com`). HTTPS only. |
| `abilities` | ability[] | no | Host abilities it uses (§7), e.g. `todos`, `timetable`, `browser`, `otp`, `sms`. |
| `shared` | path | no | A YAML file `{ constants, functions }` every tool sees (a tool's own definitions win). Use it for data and helpers several tools need. |
| `tools` | map name → path or inline tool | no | §5. Names `^[a-zA-Z][a-zA-Z0-9_]{0,39}$`. |
| `dataSources` | map name → `{ tool, args?, ttl }` | no | Read tools widgets and scheduled checks may poll; `ttl` like `5m`, `1h`. |
| `widgets` / `screens` | map name → path | no | §8. |
| `settings` | list `{ screen, title, subtitle?, icon? }` | no | Rows on the plugin's page in Settings. |
| `commands` | map name → `{ description, prompt, aliases?, argHint? }` | no | Slash commands; `prompt` with `{{input}}`. |
| `defaultModes` | `{ read?, write?, money?, public? }` → `auto`/`ask`/`off` | no | Suggested permission modes; the app applies the stricter of this and its own defaults for unverified plugins. |
| `cloud` | CloudManifest | no | As in CLOUD.md §2.2. |
| `i18n` | `{ en: {...} }` | no | Same overlay shape as `PluginTranslation`. |
| `remote` | `{ mcp: URL, auth?: none|bearer }` | no | A remote MCP plugin described by a `PLUGIN.md` (no tools; the server's tools are used). Replaces `pku-harness.plugin.json`. |
| `server` | object | no | Server functions, collections and schedules run by the cloud server ([CLOUD-FUNCTIONS.md](CLOUD-FUNCTIONS.md)). Implies `cloud.uses: [functions]`; `cloud.disclosure` (what leaves the device) is then required. **Off on the official server for now** (CLOUD-FUNCTIONS.md is on hold): keep plugins phone-side, or use your own backend (CLOUD-FUNCTIONS §9). |

The Markdown body becomes the plugin's `instructions` (sent to the model in the plugin's prompt
section). Keep it short: when to use which tool, what the numbers mean.

## 5. Tools

A tool file (or inline object):

| Field | Type | Meaning |
|---|---|---|
| `title` | string | Short Chinese title shown to users. |
| `description` | string | For the model: when and how to use it. |
| `effect` | `read` \| `write` \| `money` \| `public` | Declared honestly; `read` tools must not change state. |
| `untrusted` | bool | The result carries third-party text (posts, notices). Taints the turn (AGENT-HARNESS §5.7). Default `false` for verified plugins, `true` otherwise. |
| `userOnly` | bool | Only a human tap may run it (e.g. payment flows). |
| `input` | map name → field | Input fields (§5.1). |
| `constants` | map | Static data (tables, aliases). |
| `functions` | map name → lambda | Pure helpers, `(a, b) => expr`. |
| `steps` | Step[] | §6, run in order. |
| `return` | expression | The tool's result (JSON). |

### 5.1 Input fields

`{ type: string|number|integer|boolean|array|object, enum?, default?, optional?, description?,
min?, max?, pattern?, trim?, items? }` (`trim`: strings are trimmed before validation). Compiled to zod; invalid input is rejected before any step runs
(`invalid_input`, as today).

### 5.2 Results

Return plain JSON. Conventions the harness understands:
- `{ status: 'verification_required', kind, methods, message }` — the user (or agent) must supply
  a code; see §6.6.
- `{ status: 'needs_input', fields, message }` — ask the user for missing data.
- `{ items, hasMore, truncated }` for lists.
Strings longer than the tool-output cap are clipped by the harness, as today.

## 6. Steps

Each step does one thing and may bind its result with `let: name`. Later steps and `return` see
bound names, `input`, `constants`, `functions`, and `now`.

| Step | Shape | Does |
|---|---|---|
| value | `{ let, value: expr }` | Bind an expression. |
| request | `{ let, request: Request, as?: json\|text\|html\|response }` | One HTTP request (§6.1). |
| each | `{ let, each: expr, concurrency?: 1–4, request \| steps \| value }` | Map over a list (≤ 50 items); `item`, `index` in scope; results in order. |
| paginate | `{ let, paginate: { request, next: expr, items: expr, max: 1–30 } }` | Repeat a request while `next` (evaluated on each page) is non-null; collect `items`. |
| extract | `{ let, extract: { from, each, fields }, limit? }` | Items from HTML / JSON (§6.3). |
| if | `{ if: expr, then: Step[], else?: Step[] }` | Branch. |
| check | `{ check: expr, error: template, code? }` | Fail the tool with a message unless `expr` is truthy. |
| try | `{ try: Step[], catch: Step[] }` | Run `catch` (with `error` in scope) if `try` fails. |
| kv | `{ let?, kv: get\|set\|delete, key: template, value?: expr, ttl? }` | The plugin's own storage (namespaced, as `ctx.kv`). |
| cache | `{ let, cache: { key, ttl, staleOnError?: bool }, steps: Step[] }` | Memoize the inner steps' last value in KV. |
| call | `{ let?, call: <tool>, input: expr }` | Call another tool of the same plugin. |
| ability | `{ let?, ability: <name>.<op>, args: expr }` | Call a host ability (§7). |

### 6.1 Request

```yaml
request:
  campus: treehole          # OR omit for public HTTP (host must be in `network`)
  url: /chapi/api/v3/hole/list   # absolute, or a path on the campus service's host
  method: GET               # GET | POST
  query: { page: '${input.page}' }
  headers: { referer: https://example.pku.edu.cn/ }
  json: { ... }             # OR form: { k: v | [v1, v2] } OR body: "raw" + contentType
  followRedirects: true
  timeout: 15s
as: json                    # json | text | html | response
```

- `as: response` binds `{ status, url, headers, text }` (final URL after redirects, response
  headers lower-cased); the other forms bind the parsed body. Non-2xx statuses fail the step
  unless `as: response`.
- Public requests send the harness user agent, are HTTPS-only, ≤ 2 MB, and only to `network`
  hosts. Campus requests go through `services.campus.request` with the user's session; the
  plugin never sees cookies or tokens.
- Per run: ≤ 60 requests, ≤ 4 in flight, ≤ 60 s total.

### 6.2 Expressions and templates

Two kinds of values:
- **Expression fields** hold one expression, written bare: `value`, `each`, `if`, `check`,
  `return`, `next`, `items`, `from`, `input` (of `call`), `args` (of `ability`), `value` (of
  `kv set`), and the bodies in `functions`.
- **Template strings** are every other string (`url`, `query` / `headers` / `form` values,
  `error`, `key`…). `${ expr }` inside them is replaced by the value; a template that is exactly
  one `${ expr }` keeps the value's type (number, list…).

YAML note: quote an expression that contains `: ` (e.g. a ternary or an object literal) or
starts with `{`, `[`, `'` or `"`, or write it as a block scalar (`return: |`). The validator
points at the exact line when YAML read an expression as something else.

The expression language is a small, safe subset of JavaScript that people and models already
read:

- Literals: numbers, strings, `true/false/null`, arrays, objects; `.` / `?.` / `[]` access.
- Operators: `+ - * / %`, comparisons, `== !=` (strict), `&& || ?? !`, `? :`.
- Arrow functions `(a, b) => expr` (single expression), only as arguments or in `functions`.
- Method calls on a fixed allowlist (below). No `new`, no assignment, no globals, no
  `constructor` / `__proto__` / `prototype`. Evaluation is bounded (100 000 operations per run).
- A name that was never bound is an error (catches typos). Bind optional values first, e.g.
  `- let: failure` / `value: "null"` before a `try` that may set it.

Standard library (functions, and the same as methods where it reads better):

| Group | Functions |
|---|---|
| Lists | `map filter find some every flatMap flat slice concat includes indexOf join reverse length`, `sortBy(list, f, desc?)`, `groupBy(list, f)`, `unique(list, f?)`, `sum(list, f?)`, `count(list, f?)`, `min max`, `range(a, b)`, `chunk(list, n)`, `zip` |
| Objects | `keys values entries fromEntries pick omit merge` |
| Strings | `trim lower upper split replace(s, regex, with) startsWith endsWith padStart`, `match(s, regex)` → groups or null, `matchAll(s, regex)`, `test(s, regex)`, `squash(s)` (collapse whitespace), `clip(s, n)`, `fmt(template, values)` |
| Numbers | `num(x, fallback?)`, `int(x)`, `round(x, digits?)`, `fixed(x, n)`, `abs floor ceil`, `yuan(fen)` |
| Dates | `now` (ms), `date(text, format?)` (understands `YYYY-MM-DD[ HH:mm]`, `MM月DD日`, `上午/下午`), `formatDate(ms, pattern)`, `addDays`, `daysBetween`, `minutesOf('HH:mm')`, `weekday(ms)`, `startOfDay` — all in Beijing time (UTC+8) |
| URLs | `url(base, path)`, `query(url, name)`, `encode(s)` |
| HTML | `html(text)` → document; `select(doc, css)` → nodes; `first(doc, css)`; node `.text`, `.attr(name)`, `.html`, `.data(name)`; `tableRows(node, { header: true, spans: true })` → row objects keyed by header label (rowspan/colspan expanded); `options(select)`; `htmlText(s)` (strip tags, decode entities); `largestText(doc)` |
| JSON | `json(text)`, `path(value, 'a.b[0].c')` |
| Ranges | `compactRanges([1,2,5,6,7])` → `"1-2,5-7"` |

Regexes are written as strings and compiled once; patterns are length-bounded. Start a pattern
with inline flags for case-insensitive and similar matching: `'(?i)^yanyuan'` (i, m, s, u). In
expression strings an unknown escape keeps its backslash (`'\d+'` is the regex `\d+`), unlike JS,
so patterns survive YAML; still prefer single-quoted YAML or `|` blocks for them. Expressions may
contain `// …` and `/* … */` comments.

`tableRows(node, { cells: true })` returns grid rows of `{ text, row, col, rowspan, colspan, id }`
(`id` is shared by every slot one merged cell covers) when a parser must tell merged cells apart.

### 6.3 Extraction shorthand

For the common "list of items from HTML" case:

```yaml
- let: notices
  extract:
    from: page                 # expression: html text or document
    each: li.news-item          # CSS selector for each item
    fields:
      title: a.title | text
      href: a.title | attr href | url
      date: .date | text | date
  limit: 20
```

Field pipes: `text`, `html`, `attr <name>`, `data <name>`, `url` (resolve against the page URL), `num`, `date`,
`match <regex> [group]`, `trim`, `squash`. JSON responses use `path:` instead of CSS.

### 6.4 Errors

A failing step fails the tool with `failed` and a message (template) unless inside `try`. The
harness keeps today's behaviour: the agent sees the message; a widget keeps the last value and
shows "刷新失败".

### 6.5 Limits (enforced by the interpreter)

≤ 200 steps executed per run (loops count), ≤ 60 requests, ≤ 60 s wall time, ≤ 2 MB per response,
≤ 1 MB result, ≤ 100 000 expression operations, KV ≤ 256 KB per plugin. Exceeding a limit fails
the run with a clear message.

### 6.6 Second factors

Campus services that demand an SMS or OTP check (treehole 40002 / 40077) are handled by the
`verify` ability (§7): `ability: verify.treehole` wraps a request, redeems `input.code` when
given, auto-fills the OTP when the authenticator is bound, and otherwise returns
`{ status: 'verification_required', … }`. Plugins don't re-implement the state machine.

## 7. Host abilities

Abilities are harness features a plugin may use if it declares them in `abilities`. Each has a
fixed effect; the tool calling it must declare at least that effect.

| Ability | Ops | Effect | Notes |
|---|---|---|---|
| `verify` | `treehole({ request, code?, via? })` (read), `treeholeSendCode()` (write) | | §6.6 |
| `otp` | `code()` | read | Current IAAA OTP if the authenticator is bound |
| `todos` | `list add update setDone remove` | write (list: read) | The user's to-dos |
| `timetable` | `get upsert remove` | write (get: read) | Courses |
| `scheduler` | `create update remove list` | write | Reminders and checks (same policy as today) |
| `browser` | `open(url)` | read | HTTPS only; opens outside the app |
| `campusPage` | `open(service)` | read | Opens a campus site already signed in |
| `sms` | `awaitCode()` | read | One-tap SMS code (user-mediated) |
| `files` | `pick({types})` | read | User picks a file; returns a handle for `request.multipart` |
| `crypto` | `sha256(text)` | read | For request signing |

New abilities are added to the harness (TypeScript, `@pku-harness/sdk` `lang/abilities.ts`),
reviewed once, and then every plugin can use them. This is the extension point for things the
language can't express safely. The ability table is injected by the host: the cloud server runs
the same interpreter with its own set (collections, push, channels; CLOUD-FUNCTIONS.md), where
`secrets.NAME` is visible only inside request templates.

## 8. UI: widgets, screens, commands

- **Widgets** are the dashboard's existing AI-built format: `{ title, sizes?, spec, bindings }`
  where `spec` is a generative-UI spec (`src/genui` catalog) and `bindings` map JSON pointers to
  `{ tool, args?, path?, ttlMinutes? }` read tools of this plugin, or `{ fn, … }` read server
  functions of this plugin (shared data across users; off on the official server for now; the compiler backs each with a read tool
  `fn_<name>`, and a missing cloud consent shows as an error, never a sheet). Lists use the
  catalog's element-level `repeat: { statePath, key }` with `{ "$item": "field" }`. The dashboard's widget gallery
  lists them next to built-in widgets; `dashboard.addPluginWidget` places them.
- **Screens** are full-page generative-UI specs with bindings, mounted at `/p/<id>/<screen>`
  (`presentation: modal` → `/m/…`). Actions: `callTool` (same permissions as the agent),
  `submit`, `ask` (send a prompt to the agent), `navigate`, `open` (URL, HTTPS).
- **Commands** are prompt templates (`{{input}}`).
- Host components that need native code (payment QR, OTP digits, hourglass, file picker) are
  catalog components the harness provides; plugins reference them by name.

## 9. Permissions and safety

What the user sees before installing (and again when an update asks for more):
- Campus services (with the user's session), public hosts, abilities, and the effects of its
  tools; whether it's **verified** (listed by pkuinfo after review) or from a community repo.

What the harness enforces:
1. Requests only to declared campus services / public hosts; HTTPS; size and time limits (§6.5).
2. Every tool goes through `invokeTool`: per-effect modes (auto / ask / off), approvals,
   `userOnly`, the scheduler's read-only rule, output scrubbing.
3. Unverified plugins start with `write`, `money` and `public` on **ask**, and their tools are
   `untrusted` (results are data; the turn is tainted; memory writes need approval).
4. Credentials never reach a plugin: campus requests are signed by the harness. A plugin can't
   read cookies, tokens, other plugins' KV, or anything not returned by its own requests.
5. No code runs: the interpreter executes a fixed instruction set, so a malicious plugin can at
   worst misuse what it declared, under the user's permission modes.

## 10. Sharing, install and updates

**Install links** the app accepts (paste box, QR code, deep link, marketplace button):

| Form | Example |
|---|---|
| GitHub folder | `https://github.com/<owner>/<repo>/tree/<ref>/<path>` |
| GitHub repo root | `https://github.com/<owner>/<repo>` (PLUGIN.md at the root) |
| GitHub file | `https://github.com/<owner>/<repo>/blob/<ref>/<path>/PLUGIN.md` |
| Any HTTPS URL of a `PLUGIN.md` | `https://example.com/p/PLUGIN.md`, a raw gist URL |
| Deep link | `pkuharness://plugin?src=<url-encoded link of any form above>` |

GitHub links are fetched from `raw.githubusercontent.com` (fallback jsDelivr); other URLs
directly. Files named in the frontmatter are fetched relative to the `PLUGIN.md` URL.

**Install**: fetch → parse and validate everything (schema, expressions compile, paths, limits)
→ show the permission sheet → store the files and a content hash on the device → register.
Installed plugins work offline; nothing is fetched at tool-run time except the plugin's own
requests.

**Updates**: on app start (at most daily) and on pull-to-refresh in the plugin page, the app
re-fetches the link. Same hash → nothing. New hash with the same declarations (campus, network,
abilities, effects) → applied, with a "updated to 1.3.0" note in the plugin page. Wider
declarations → held until the user accepts. Users can pin a plugin (no updates) or roll back to
the previous version (kept on device).

**Bundled plugins** (shipped with the app) are the same documents, embedded at build time from
the plugins repo (`plugins/<id>/PLUGIN.md` → generated module), and update from their GitHub
link like any other plugin, so fixing a parser no longer needs an app release.

**Marketplace**: the website scans registered repos for `PLUGIN.md` files and renders install
buttons (link + QR). `registry/registry.json` keeps the curated list (verified flag). A
`PLUGIN.md` with `remote.mcp` describes a remote MCP plugin; `pku-harness.plugin.json` remains
as a fallback until all listings move.

## 11. Authoring with the agent

Core tools (in the `plugins` plugin):
- `plugins.draft({ goal, url? })` — returns the language reference and examples the model needs
  (on demand, not in every prompt).
- `plugins.validate({ files })` — full validation with precise errors.
- `plugins.tryTool({ files, tool, input })` — dry-run against the live service with the user's
  session, under the declared limits, nothing stored.
- `plugins.installLocal({ files })` — effect `write`, always asks: shows the permission sheet;
  the plugin is stored as *local* (no update link) and can be edited, exported (share as a gist
  or file) or published by pushing the folder to GitHub.

Users can open any installed plugin's source in the app (read-only for linked plugins, editable
for local ones).

## 12. Implementation

| Piece | Where | Notes |
|---|---|---|
| Manifest + tool schemas | plugins repo `packages/sdk/src/lang/schema.ts` (`manifestSchema`, `toolSchema`) | zod; the website mirrors them |
| Expression parser + evaluator | `packages/sdk/src/lang/expr.ts` | Hand-written Pratt parser; allowlisted methods; op budget |
| Standard library | `packages/sdk/src/lang/stdlib.ts` | Pure; HTML via `node-html-parser` |
| Step runner | `packages/sdk/src/lang/run.ts` | Uses `HostServices` + an injected `fetch`; enforces limits |
| Loader | `packages/sdk/src/lang/load.ts` | `PLUGIN.md` (frontmatter via `yaml`) + files → validated document → `PluginDef` (`compilePlugin`) |
| Link resolver | `packages/sdk/src/lang/link.ts` | Install-link forms → file URLs |
| Install store + updates | app `src/core/runtime/doc-plugins.ts` | KV `doc-plugins`, content hashes, update check, rollback |
| Install UI | app `src/screens/plugins/add-remote.tsx` → one "Add by link" sheet for MCP and `PLUGIN.md`; deep link `pkuharness://plugin` | Permission sheet before install |
| Widgets / screens | app: doc widgets go through the existing AI-widget renderer; screens through `GenUI` | No new renderer |
| CLI | plugins repo `scripts/plugin.ts`: `validate <dir>`, `test <dir>` (replays `tests/*.yaml`), `run <dir> <tool> <json>` | Contributors run plugins on a computer, no phone needed |

Dependencies added: `yaml` (pure JS, Hermes-safe) to the app and the plugins repo.

## 13. Migration

Port in order of difficulty, keeping tool ids (`<id>.<tool>`) so widgets, scheduled checks and
memories keep working:

1. **Prove the language**: `classrooms`, `campus-events`, `canteen` (crowd, hours, notices),
   `notices`, `grades` (with `verify.treehole`). Each port keeps the plugin's existing tests as
   `tests/*.yaml` fixtures.
2. **Medium**: `course-catalog`, `elective`, `library` reads, `treehole` tools, `shuttle`
   (static timetable as `constants`).
3. **Needs new abilities first**: `room-booking` (redirect-URL results), `library.reserveSpace`,
   `courses` (multipart upload → `files` ability), `wallet` recharge (`crypto` signing),
   `finance` (cwfw obfuscation → a `cwfw` request mode in the harness adapter), `calendar`
   (bundle scraping → a `calendar` ability or host-side parser).
4. **Stays TypeScript (harness)**: `ui`, `dashboard`, `scheduler`, `todo`, `schedule`,
   `timetable`, `memory`, `plugins`, `deepseek`, `openai-compatible`, `authenticator`, the
   payment-code screen. These are the harness's own features, not integrations.

A TypeScript plugin and its document replacement don't coexist: the document takes over the id
once it passes the same fixtures; the TS folder is deleted.

## 14. Versioning

`spec: 1` is frozen once shipped: new steps, functions and abilities may be added (old plugins
keep working); anything that changes meaning bumps `spec`. The app supports the current and the
previous spec. The website documents every addition with the app version that introduced it, and
the manifest may say `minApp: 1.4.0` when it relies on a newer ability.

## 15. Open questions

1. Signing plugin links (authors sign `PLUGIN.md` hashes) vs trusting GitHub transport + the
   verified list. v1: transport + content hash + verified list.
2. Whether the agent may install a plugin it drafted without the user opening the sheet. v1: no.
3. iOS: the interpreter is pure TS and works unchanged; campus requests wait for the Swift
   `campus-http` port (IOS.md).
