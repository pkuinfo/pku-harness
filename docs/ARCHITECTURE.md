# pku-harness Architecture

> v0 spec, 2026-10-18. This is the source of truth for how the app is built.
> When an implementation decision changes, update this file in the same commit.

## 1. Product

A PKU student installs one app (Android first, iOS later), signs in once with their campus
account, and an AI agent runs their campus life with them: card balance, network fee,
timetable, courses, reminders, and anything a plugin adds.

Two ideas, both borrowed from DeepSeek Harness (`../deepseek-harness/docs/architecture.md`):

1. **Everything is a plugin.** Campus services, dashboard widgets, generative-UI components,
   scheduler actions and even the model provider are contributed by plugins registered in
   one runtime. The core only wires plugins together; there is no privileged feature code.
2. **AI-native, human-equal.** Every capability exists once, as a typed operation. The UI
   calls it on a tap; the agent calls it as a tool. Anything a human can create or change
   (a widget, a reminder, a plugin permission), the agent can too, and vice versa.

The app is open source. Users bring their own model (OpenAI-compatible base URL + API key);
a hosted model option comes later.

## 2. The four tabs

| Tab | Route | Purpose |
|---|---|---|
| Chat | `src/app/(tabs)/index.tsx` | Agent conversation. Streams text, shows tool activity, renders **generative UI** (forms, pickers, cards, checkouts) inline. Users create dashboards and reminders from here. |
| Dashboard | slot, filled by the `dashboard` plugin | A grid of **widgets** built by the agent on request. Each widget binds a plugin data source to a UI spec. Changed through chat or by long-press. |
| Schedule | slot, filled by the `schedule` plugin | Timetable (time, building, room, course), to-dos and reminders. Every recurring item is a **job** in the shared scheduler. |
| Settings | `src/app/(tabs)/settings.tsx` | Campus account, AI provider, plugins and their permissions, notifications, appearance, data. Minimal by design. |

## 3. Layers

```
UI            src/app (routes) · src/screens · src/theme + src/components (design system) · src/genui
                    │  hooks / stores
Core runtime  src/core
              ├─ runtime/    plugin host: register, contributions, lifecycle
              ├─ agent/      agent loop, system prompt assembly, tool registry, session log
              ├─ genui/      catalog of components the agent may render (json-render)
              ├─ dashboard/  widget model + persistence
              ├─ scheduler/  job model, recurrence engine, executors
              ├─ store/      SQLite (data) + SecureStore (secrets)
              └─ campus/     campus session manager (IAAA login, per-service sessions)
                    │
Plugins       src/plugins/<id>   built-in: campus-card, netfee, timetable, courses, …
                    │
Native        modules/campus-http  Expo module: HTTP client with redirect control,
                                   per-session cookie jars, HTTP/1.1, extra trust anchors
```

Dependencies point down only. Plugins never import screens; screens reach plugins only
through the runtime.

## 4. Plugin model

**The app is the harness, not the content.** Every capability is a plugin and every plugin is
equal. All plugins — including the ones bundled in the app — live in
[`pkuinfo/pku-harness-plugins`](https://github.com/pkuinfo/pku-harness-plugins), checked out
here as the git submodule `./plugins`:

| In the plugins repo | Role |
|---|---|
| `packages/sdk` (`@pku-harness/sdk`) | The contract: `definePlugin`, tools, providers, `HostServices`, `Capability`, dynamic descriptions; pure helpers (recurrence, schedule input, timetable model, check conditions) with tests |
| `plugins/<id>` + `plugins/index.ts` | Bundled plugins (`builtinPlugins`), built only on the SDK |
| `registry/registry.json` | Marketplace index (bundled and remote plugins side by side) |
| `templates/`, `examples/` | Remote plugin template and the demo-canteen MCP example |

The app resolves `@pku-harness/sdk`, `@pku-harness/plugins` and `@pku-harness/registry`
through tsconfig paths (Metro honours them). Plugins never import app code: everything outside
themselves goes through `ctx.services`, implemented by the harness in `src/core/services.ts`
(registry, remote, genui, scheduler, widgets, todos, timetable). Bundled plugins ship in the
binary because stores forbid downloading code; community plugins are remote (MCP).

**Plugin UI.** The harness owns Chat and Settings; the Dashboard and Schedule tabs are
*slots* (`TabSlotHost`) filled by whichever enabled plugin contributes them
(`contributes.tabs`: dashboard plugin, schedule plugin), with an empty state otherwise.
Plugins also contribute screens (`contributes.screens`, at `/p/<plugin>/<screen>`, or
`/m/<plugin>/<screen>` for `presentation: 'modal'` forms) and Settings rows
(`contributes.settings`). A screen receives `HostUI`
(`src/core/host-ui.tsx`: the design-system components, haptics, navigation,
`useStoreVersion()`), `services`, its plugin `kv` and `invoke(tool, input)` (same permissions as
the agent). Metro blocks `plugins/node_modules` so plugin code shares the app's React.

**Device capabilities.** A phone has no shell or filesystem for plugins, limited background
time, and campus-only hosts. Plugins declare `requires`; `registry.unavailable(id)` compares
with `HOST_CAPABILITIES` and the harness hides unavailable plugins from the agent, refuses
their tools and explains why in Settings. Heavier work belongs in remote plugins.

A plugin is a TypeScript object:

```ts
definePlugin({
  id: 'campus-card',
  name: '校园卡',
  version: '0.1.0',
  permissions: ['campus:portal2017', 'network:bdcard.pku.edu.cn'],
  tools: { getBalance, listTransactions, getPaymentCode, … },  // typed with zod
  dataSources: { balance: { tool: 'getBalance', ttl: '5m' } },   // for widgets & checks
  widgets: { … },          // optional preset widget specs
  components: { … },       // optional extra generative-UI components
  setup(ctx) { … },        // optional: subscribe to events, register jobs
})
```

- **Tools** are the single API surface. Each has an id (`campus-card.getBalance`),
  description, zod input/output schema, an `effect` (`read` | `write` | `money` | `public`)
  and an `execute(input, ctx)` function.
- **Built-in plugins** ship inside the app bundle. Store rules forbid downloading
  executable code, so **marketplace plugins are remote**: a manifest plus an endpoint that
  speaks MCP over HTTP (or a small HTTP tool schema). The app fetches their tool list,
  exposes those tools to the agent and renders their UI through the same component catalog.
  No third-party JavaScript runs in the app.
- **Remote plugins today** (`src/core/runtime/remote.ts`, `src/core/mcp/client.ts`): the user
  (or the agent, after an approval) adds an MCP Streamable-HTTP URL and optional bearer token
  (SecureStore). The manifest and tool list are cached; each MCP tool becomes a registry tool
  (`mcp-<server>.<tool>`) with input from `z.fromJSONSchema`, effect `read` when
  `readOnlyHint`, else `write`. Results are returned as `{ source, data }` and the plugin's
  prompt section marks them as data. Defaults for remote plugins: read auto, everything else
  ask.
- **Permissions** are granted per plugin in Settings. A remote plugin never receives the
  campus password. It can receive only what the user granted (for example a
  service-scoped session token), and the grant is visible and revocable.
- `ctx` gives a plugin: `campus` (authenticated HTTP to campus services), `store`
  (namespaced KV), `notify`, `scheduler`, `log`.

## 5. Agent

- **Model access is a plugin too.** A *provider plugin* contributes model access through a
  `providers` contribution: id, display name, auth kind (`apiKey` | `account` | `none`),
  config fields (base URL, model list), and a factory returning an AI SDK `LanguageModel`.
  Built-in: DeepSeek (default) and generic OpenAI-compatible. Community plugins can add
  others (Anthropic, Kimi, GLM, Ollama on LAN…) and subscription/account sign-in flows,
  modeled on DeepSeek Harness's `llm-deepseek-account` / `llm-pi-ai` adapters. Secrets
  live in SecureStore per provider; the agent asks the active provider for its model.
  Streaming uses `expo/fetch`.
- **Loop**: `streamText` with tools from every enabled plugin plus core tools, multi-step
  until the model stops. Every turn is appended to a session log in SQLite, the same
  "model-visible means logged" rule DeepSeek Harness follows.
- **Core tools** (always present):
  - `ui.render`: show a generative-UI spec in the chat (form, picker, card, list, …).
    User input in that UI comes back to the agent as the next message.
  - `dashboard.upsertWidget` / `dashboard.removeWidget` / `dashboard.list`
  - `scheduler.createJob` / `updateJob` / `deleteJob` / `listJobs`
  - `todo.*`, `plugins.list`, `settings.get`
- **Autonomy**: by product decision, once a user accepts the terms and grants a plugin, the
  agent may call its tools without per-call confirmation. Each plugin's permission row in
  Settings has a per-effect switch (`read`/`write`/`money`/`public`) so a user can require
  a tap for some effects. Defaults are set in the plugin manifest.
- **Request context** (DeepSeek Harness's context plugins): a plugin may define
  `context({ query, kv, services })`. Before each turn the harness gathers these (800 ms budget
  each) and prepends them to the user's message as `<context>…</context>` in the model-visible,
  logged history; the chat UI shows only what the user typed. The memory plugin uses this to
  add the few memories relevant to the question (pinned ones always).
- **Approvals**: when an agent call hits an effect set to `ask`, `invokeTool` awaits
  `src/core/runtime/approvals.ts`; the root layout shows a prompt (plugin, tool, effect,
  inputs) with allow / deny / always allow. User taps never ask; the background runtime has no
  prompt, so `ask` there means decline.
- **Untrusted content**: text coming from campus services (forum posts, announcements) is
  wrapped as data in tool results, never concatenated into instructions.

## 6. Generative UI

- Library: `@json-render/core` + `@json-render/react-native`. The agent emits a JSON spec;
  the app renders only components from a **catalog** we define (zod-typed props).
- The catalog = json-render standard components restyled with our design system, plus
  pku-harness components: `StatCard`, `Sparkline`, `ProgressRing`, `TimetableDay`,
  `PaymentQR`, `ChoiceList`, `DateTimeField`, `ConfirmBar`, …
- The same catalog powers dashboard widgets, so the agent learns one UI language.
- Actions inside a spec (`submit`, `callTool`, `openRoute`, `setState`) are handled by the
  host; `callTool` goes through the same permission check as the agent.

## 7. Dashboard

The dashboard is itself a plugin (`dashboard`, filling the harness's dashboard tab slot). It
shows two kinds of widget side by side, in one ordered list:

| Kind | Who draws it | Data |
|---|---|---|
| **AI-built** `{ spec, bindings }` | the agent writes a generative-UI spec (`dashboard.upsertWidget`) | `bindings: { [jsonPointer]: { tool, args?, path?, ttlMinutes? } }`, read-only tools only, written into the spec's state (`{ "$state": "/card" }`, `$template`) |
| **Plugin-provided** `{ source: { plugin, widget, config? } }` | the plugin's own native component (`contributes.widgets`), mounted by the host's `PluginWidget` inside an error boundary | the component calls `host.useToolData(tool, args, { ttlMinutes })` |

The agent checks `dashboard.catalog` first and places a plugin widget when one fits
(`dashboard.addPluginWidget`), building its own only otherwise. The user gets the same choice in
the dashboard's widget gallery (`/m/dashboard/gallery`, live previews; "添加" calls the same
tool). The dashboard draws the card chrome (title, freshness, long-press to edit) for both.

**Refresh: stale-while-revalidate, owned by the host** (`src/core/dashboard/live.ts`, the
TanStack Query model). Every read-tool result lives in one store keyed by tool + args, shared by
AI-built widgets, plugin widgets, plugin screens and scheduled checks:

- The last value is persisted (SQLite `cache`), so a cold start shows numbers immediately, with
  "3 分钟前" freshness; a skeleton appears only when nothing was ever fetched.
- A value is stale after its TTL (default 5 min; balances 5–15, slow data 60+). Stale queries
  that are *on a focused screen* refetch on screen focus, when the app returns to the
  foreground, and on a 30 s tick while visible. Hidden tabs and the background never poll.
- Pull-to-refresh forces every query on screen and ends when they settle; each card has retry.
- Identical concurrent requests share one promise. A failed refresh keeps the last value and
  marks it ("刷新失败 · 10 分钟前").
- Scheduled checks (§8) prime the store with their result, so a background balance check also
  updates the widget. Background freshness is the scheduler's job, never the dashboard's.

Edit mode (long-press): drag to reorder, cycle size, delete. Starter widgets that need no login
(today / teaching week / reminders) seed the first run.

## 8. Scheduler and notifications

One engine serves dashboard alerts, schedule reminders and to-dos.

- **Job**: `{ id, title, trigger, action, enabled, runs, lastRunAt, nextRunAt }`.
- **Trigger** (recurrence): `at` (one-shot), or `every` with `{ unit: minute|hour|day|week,
  interval, times?: ['08:00'], startAt, count?, until? }`. Covers "in 2 days", "every
  morning", "every 3 days, 16 times then stop".
- **Action**: `notify` (static message), or `check` (call a plugin data source, evaluate a
  condition like `balance < 100`, notify only if true, optionally run the agent with the
  result).
- **Execution** (`src/core/scheduler`):
  - `recurrence.ts` is pure and unit-tested: a series is periods (minute/hour step, day, or
    Monday-based week) × slots (times × weekdays); slots before `startAt` are skipped, the
    rest numbered 0…n and cut by `count` / `until`. All times are device-local.
  - `notify` jobs are armed ahead as exact `DATE` notifications (expo-notifications uses
    `setExactAndAllowWhileIdle` when the exact-alarm permission is granted). Window: 14 days,
    ≤ 64 per job, ≤ 400 total (Android caps 500 alarms per app). Identifiers encode
    `job:<id>:<updatedAt>:<index>`, so `sync()` diffs desired vs scheduled and edits re-arm.
    `sync()` runs on start, on every change, on foreground and from the background task.
  - `check` jobs call a **read-only** tool, read a dot path, evaluate the condition
    (`< <= > >= == != changed always`) and notify with `{value}` filled in. Foreground: a
    timer fires them on the exact minute. Background: `expo-background-task` (WorkManager,
    ≥ 15 min, inexact) runs whatever is due via `bootCore()` without UI. For exact timing while
    the app is killed, each enabled check job also gets a react-native-notify-kit trigger at its
    next run (`exact-wake.ts`): AlarmManager `setExactAndAllowWhileIdle`, silent MIN channel; the
    DELIVERED event starts a headless JS task that runs the due checks, re-arms and dismisses the
    placeholder.
  - The agent and forms use a friendlier input (`schedule-input.ts`): local
    `"YYYY-MM-DD HH:mm"` strings, converted to triggers and summarized back as human text
    plus the next occurrences, so the model can confirm times to the user.
- **Timetable**: synced from the campus timetable plugin into SQLite; class reminders are
  ordinary `notify` jobs.

## 9. Campus access

- **Credentials** (student id, password, optional TOTP secret) live only in SecureStore on
  the device. The app does not send them to any server we run.
- **Login**: IAAA password login (RSA public key from IAAA, then the per-service token
  exchange), implemented in `src/core/campus` following `pkucli/crates/common` and each
  service crate. Sessions are cached per service with expiry and refreshed on demand.
- **Transport**: `modules/campus-http` (Expo module, Kotlin/OkHttp now, Swift later)
  because React Native `fetch` cannot: disable redirects and read `Location`, keep isolated
  cookie jars per service, force HTTP/1.1, or trust the extra certificate some campus hosts
  need. Every plugin talks to campus hosts through this module via `ctx.campus`.
- **Plugins never get credentials.** The harness (`src/core/campus`) signs in per service
  (`card`: IAAA → portal ssoLogin → redirectToCard → berserker-auth JWT, refreshed on 401;
  `its`: ITS web login) and plugins call `services.campus.request(service, req)` to receive
  responses. Cookies are persisted in SecureStore per session. The `campus-session`
  capability is available where the native module exists (Android).
- **Reference**: `../pkucli` is the protocol reference for every service. Port behaviour
  from it rather than rediscovering it; credit the source file in comments.

## 10. Storage

| Data | Where |
|---|---|
| Campus credentials, AI API key | `expo-secure-store` |
| Sessions, chat log, widgets, jobs, todos, timetable cache, plugin KV | `expo-sqlite` (one DB, versioned migrations) |
| UI prefs (theme, last tab) | SQLite KV |

## 11. Design system

See `docs/DESIGN.md`. Summary: dark-first, finance-app precision (OKX/Binance references),
expressive motion with Reanimated 4, native controls from `@expo/ui` where they exist,
tokens in `src/theme`, shadcn-style component API in `src/components`.

## 12. Folder layout

```
pku-harness/
├─ docs/                ARCHITECTURE.md · DESIGN.md · PLAN.md
├─ modules/campus-http/ Expo native module
├─ src/
│  ├─ app/              routes only (Expo Router)
│  ├─ screens/          screen bodies
│  ├─ theme/            design tokens
│  ├─ components/       design-system primitives
│  ├─ genui/            json-render catalog + registry
│  ├─ core/             runtime, agent, dashboard, scheduler, store, campus
│  ├─ plugins/          built-in plugins, one folder each
│  └─ utils/
└─ assets/
```

## 13. Non-goals for v0

iOS build, hosted model service, plugin marketplace backend, payments inside the app,
web target. The interfaces above leave room for each.
