# pku-harness Plan

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done (with date). Update this file as work lands.
Each task ends with: typecheck + lint pass, and (for UI) a screenshot check on the Android emulator.

## M0 Foundation
- [x] Expo SDK 58 scaffold with bun, Expo Router (2026-10-18)
- [x] ARCHITECTURE.md, DESIGN.md, PLAN.md, repo CLAUDE.md/AGENTS.md (2026-10-18)
- [x] T0.1 Toolchain: JDK 17, Android dev build installs and runs on emulator (2026-10-18)
- [x] T0.2 Clean template: remove demo screens/assets, set app name/id/scheme, dark splash (2026-10-18)
- [x] T0.3 Tooling: tsconfig paths, ESLint (expo lint), `bun run check` (tsc + lint), bun test setup (2026-10-18)
- [x] T0.4 First commit + push to `pkuinfo/pku-harness` (2026-10-18)

## M1 Design system
- [x] T1.1 Tokens: colors (dark/light), spacing, typography (Inter), radius, shadows, motion; `useTheme` (2026-10-18)
- [x] T1.2 Primitives: Text, Button, IconButton, Surface, ListGroup/ListRow, Chip/Badge, Field, Skeleton, EmptyState (2026-10-18)
- [x] T1.3 Motion primitives: AnimatedNumber, Stat, press feedback hook, stagger helper, haptics wrapper (2026-10-18)
- [x] T1.4 AgentOrb (Skia/Reanimated) and custom TabBar with animated pill (2026-10-18)
- [x] T1.5 4-tab shell (Chat, Dashboard, Schedule, Settings) with placeholder screens, verified on emulator (2026-10-18)
- [x] T1.7 Brand system: SVG/Skia logo + generated icons, SkSL shader backdrop, glass tokens, motion curves (2026-10-18)
- [x] T1.6 First-run welcome experience with expressive, signature motion (Skia/Reanimated hero, staged reveal of the four tabs, consent → AI setup) (2026-10-18)
- [~] T1.8 Motion pass: chat empty state on the shader backdrop with glass suggestions (2026-10-18); glass chrome and shared transitions todo

## M2 Core runtime
- [x] T2.1 Store: expo-sqlite DB with migrations + KV; SecureStore wrapper (2026-10-18)
- [x] T2.2 Plugin runtime: definePlugin, registry, tool ids, effects, permissions model, ctx (2026-10-18)
- [x] T2.3 Settings: AI provider (base URL, key, model) stored securely; connection test (2026-10-18)
- [x] T2.6 Provider plugins: `providers` contribution + registry, per-provider settings/keys (migrated from v0), AI settings picker with live `/models` listing and connection test; DeepSeek (default, DeepSeek Harness catalog) + OpenAI-compatible built in; `account` auth kind with `signIn()` hook (2026-10-18)
- [x] T2.4 Agent loop: AI SDK + openai-compatible provider, streaming via expo/fetch, tool calling, session log (2026-10-18)
- [x] T2.5 Chat screen: message list, composer, streaming text, tool-call chips, AgentOrb states (2026-10-18)

- [x] T2.7 Memory plugin (plugins repo): remember/recall/list/forget/pin, secrets refused, near-duplicates merged; SDK `context` contribution injects relevant memories per turn into the logged user turn as `<context>` data; Settings → AI 记忆 (2026-10-18)
- [x] T2.8 Device capabilities → see T10.2 (2026-10-18)

## M3 Generative UI
- [x] T3.1 json-render catalog + registry styled with our components (2026-10-18)
- [x] T3.2 `ui.render` tool; inline rendering in chat; form submit → next agent message (2026-10-18)
- [x] T3.3 Catalog components: Sparkline, Ring (animated progress), DateTime (native picker, bound) — Stat/Choice already present; PaymentQR waits for the campus-card plugin (2026-10-18)

## M4 Campus access
- [ ] T4.1 `modules/campus-http` Expo module (Android/OkHttp): sessions, cookie jars, redirect control, HTTP/1.1, extra trust anchor — PARKED (see session notes)
- [ ] T4.2 IAAA login in TS (RSA, OTP optional), credential storage, login screen + Settings account row
- [ ] T4.3 Plugin `campus-card`: balance, transactions, payment code
- [ ] T4.4 Plugin `netfee`: network fee balance and usage
- [ ] T4.5 Plugin `timetable`: course table + class times (treehole API), academic calendar
- [ ] T4.6 Plugin `courses`: Blackboard announcements + assignments (read-only)

## M5 Dashboard
- [x] T5.1 Widget model + persistence; widget renderer with data bindings (`$state` pointers) + TTL cache; loading/error/ready states (2026-10-18)
- [x] T5.2 `dashboard.*` agent tools (list/sources/upsertWidget/removeWidget/reorder) + `calendar` plugin (today, teaching week); starter widgets on first run (2026-10-18)
- [x] T5.3 Edit mode: long-press, drag handle reorder, size cycle, delete; pull-to-refresh (2026-10-18)

## M6 Scheduler & notifications
- [x] T6.1 Job model + recurrence engine (unit-tested: one-shot, daily times, every N days, weekly, count, until, DST) (2026-10-18)
- [x] T6.2 Notify executor: occurrences armed as exact DATE notifications (14-day / 64-per-job / 400 total window), diffed and re-armed on start, change, foreground and background run; verified on emulator to the second (2026-10-18)
- [x] T6.3 Check executor (read-only tool + condition + `{value}` template): exact-minute foreground timer, expo-background-task (WorkManager) in background (2026-10-18)
- [x] T6.5 Exact background checks: react-native-notify-kit AlarmManager trigger (`setExactAndAllowWhileIdle`) per check job on a silent MIN channel; its DELIVERED headless event boots the runtime, runs due checks, re-arms and removes the placeholder. Verified with the app process killed: alarm 08:41:00, result notification 08:41:03 (dev bundle load) (2026-10-18)
- [x] T6.4 `scheduler.*` agent tools: create/update/delete/list/preview/runCheck; dev deep-link tool runner for on-device testing (2026-10-18)

## M7 Schedule tab
- [x] T7.1 Timetable: courses (weekday, time, place, weeks incl. 单/双周), day list with live status/countdown, week grid with now line, semester form, class reminders (N min before; odd/even weeks → 2-week interval) — model unit-tested (2026-10-18)
- [x] T7.2 To-dos (quick add, native checkbox, due chips, reminders via scheduler, done pauses reminder) and reminders list/editor (once/repeat, day/week/hour/minute, times, weekdays, count/until, live preview); `todo.*` / `timetable.*` tools (2026-10-18)

## M8 Settings & plugins
- [x] T8.1 Plugins screen: list, enable/disable, per-effect modes (auto/ask/off), scopes, tool list (2026-10-18)
- [x] T8.2 Remote plugins: dependency-free MCP Streamable-HTTP client (tested against the official SDK server), manifest cached on device, tools mapped via `z.fromJSONSchema`, effects from MCP annotations, untrusted defaults (write/money/public ask), add/refresh/remove UI, `plugins.*` tools (2026-10-18)
- [x] T8.4 "Ask first" approvals: agent calls whose effect is set to ask raise a native prompt (allow / deny / always allow) over any screen (2026-10-18)
- [x] T8.3 Notifications (permission, exact alarms, background status, test), appearance (system/dark/light, persisted), data export (JSON, no secrets) and full reset (2026-10-18)

## M10 Plugin ecosystem
- [x] T10.1 `pkuinfo/pku-harness-plugins`: SDK (contract + pure helpers + tests), all bundled plugins ported, registry + schema + validator, remote template, demo-canteen example, CI, CONTRIBUTING; app consumes it as submodule `./plugins` and implements `HostServices` (2026-10-18)
- [x] T10.2 Device capabilities: `requires` on plugins, `HOST_CAPABILITIES`, unavailable plugins hidden from the agent and explained in Settings (2026-10-18) — completes T2.8
- [x] T10.3 Marketplace (设置 → 插件 → 插件市场): registry from jsDelivr/GitHub raw, validated with the shared schema, cached offline; search + filters; bundled shown as installed, remote one-tap install, self-hosted → add sheet prefilled (2026-10-18)
- [x] T10.4 Plugin UI contributions: SDK `HostUI` (design-system components, haptics, navigation, store version hook) + `contributes.screens` / `contributes.settings`; harness mounts them at `/p/<plugin>/<screen>` and lists rows in Settings; AI 记忆 screen moved into the memory plugin (2026-10-18)
- [x] T10.5 Dashboard and Schedule UIs live in plugins: harness tab slots (`contributes.tabs`), modal plugin screens at `/m/<plugin>/<screen>`, richer HostUI (theme, pickers, sheet, genui, sortable list); dashboard plugin owns its tab, new schedule plugin owns the schedule tab + forms; app-owned screens deleted (2026-10-18)

## M9 End-to-end
- [x] T9.0 Agent E2E on emulator against a scripted OpenAI-compatible mock model: streaming, tool calls (scheduler / dashboard / ui.render form submit / remote MCP write with approval) (2026-10-18)
- [ ] T9.1 E2E on emulator: login → ask balance → build dashboard widget → low-balance check job → notification fires
- [ ] T9.2 E2E: timetable sync → class reminder; "remind me every 3 days, 16 times"
- [ ] T9.3 Polish pass with `impeccable` + design review checklist; README for contributors
