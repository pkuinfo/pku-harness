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
| Dashboard | `src/app/(tabs)/dashboard.tsx` | A grid of **widgets** built by the agent on request. Each widget binds a plugin data source to a UI spec. Changed through chat or by long-press. |
| Schedule | `src/app/(tabs)/schedule.tsx` | Timetable (time, building, room, course), to-dos and reminders. Every recurring item is a **job** in the shared scheduler. |
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
- **Permissions** are granted per plugin in Settings. A remote plugin never receives the
  campus password. It can receive only what the user granted (for example a
  service-scoped session token), and the grant is visible and revocable.
- `ctx` gives a plugin: `campus` (authenticated HTTP to campus services), `store`
  (namespaced KV), `notify`, `scheduler`, `log`.

## 5. Agent

- **Model access**: Vercel AI SDK (`ai`) with `@ai-sdk/openai-compatible`. The provider
  config (base URL, API key, model id) lives in SecureStore. Streaming uses `expo/fetch`.
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

A widget is `{ id, title, spec, bindings: { [statePath]: { plugin, dataSource, args } },
refresh, position, size }`. On render, the host resolves each binding through the plugin's
data source (cached by TTL) and feeds results into the spec's state. The agent creates and
edits widgets with `dashboard.*` tools; the user can reorder, resize and delete by gesture.

## 8. Scheduler and notifications

One engine serves dashboard alerts, schedule reminders and to-dos.

- **Job**: `{ id, title, trigger, action, enabled, runs, lastRunAt, nextRunAt }`.
- **Trigger** (recurrence): `at` (one-shot), or `every` with `{ unit: minute|hour|day|week,
  interval, times?: ['08:00'], startAt, count?, until? }`. Covers "in 2 days", "every
  morning", "every 3 days, 16 times then stop".
- **Action**: `notify` (static message), or `check` (call a plugin data source, evaluate a
  condition like `balance < 100`, notify only if true, optionally run the agent with the
  result).
- **Execution**:
  - `notify` jobs are pre-scheduled as exact local notifications (`expo-notifications`,
    Android exact alarms). Bounded series are expanded and re-armed on each app start.
  - `check` jobs run in the background on Android via an exact alarm that wakes a headless
    JS task (planned native addition to `campus-http` or a sibling module), with
    `expo-background-task` as the fallback. iOS runs them best-effort.
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
