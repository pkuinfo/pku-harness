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
- [ ] T1.6 First-run welcome experience with expressive, signature motion (Skia/Reanimated hero, staged reveal of the four tabs, consent + AI/campus setup), and a motion pass across the app (shared transitions, list choreography, number rolls, haptics)

## M2 Core runtime
- [x] T2.1 Store: expo-sqlite DB with migrations + KV; SecureStore wrapper (2026-10-18)
- [x] T2.2 Plugin runtime: definePlugin, registry, tool ids, effects, permissions model, ctx (2026-10-18)
- [x] T2.3 Settings: AI provider (base URL, key, model) stored securely; connection test (2026-10-18)
- [ ] T2.6 Provider plugins: `providers` contribution, registry, picker in AI settings; DeepSeek + OpenAI-compatible built in; account/subscription auth kinds
- [x] T2.4 Agent loop: AI SDK + openai-compatible provider, streaming via expo/fetch, tool calling, session log (2026-10-18)
- [x] T2.5 Chat screen: message list, composer, streaming text, tool-call chips, AgentOrb states (2026-10-18)

## M3 Generative UI
- [x] T3.1 json-render catalog + registry styled with our components (2026-10-18)
- [x] T3.2 `ui.render` tool; inline rendering in chat; form submit → next agent message (2026-10-18)
- [ ] T3.3 Custom catalog components: StatCard, Sparkline, ProgressRing, ChoiceList, DateTimeField, PaymentQR

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
- [ ] T6.5 Android exact-time wakeup for check jobs while the app is dead: spike `react-native-notify-kit` trigger + `DELIVERED` headless event (docs/ECOSYSTEM.md), fallback own alarm→HeadlessJs module; today background checks are inexact (≥15 min)
- [x] T6.4 `scheduler.*` agent tools: create/update/delete/list/preview/runCheck; dev deep-link tool runner for on-device testing (2026-10-18)

## M7 Schedule tab
- [x] T7.1 Timetable: courses (weekday, time, place, weeks incl. 单/双周), day list with live status/countdown, week grid with now line, semester form, class reminders (N min before; odd/even weeks → 2-week interval) — model unit-tested (2026-10-18)
- [x] T7.2 To-dos (quick add, native checkbox, due chips, reminders via scheduler, done pauses reminder) and reminders list/editor (once/repeat, day/week/hour/minute, times, weekdays, count/until, live preview); `todo.*` / `timetable.*` tools (2026-10-18)

## M8 Settings & plugins
- [x] T8.1 Plugins screen: list, enable/disable, per-effect modes (auto/ask/off), scopes, tool list (2026-10-18)
- [ ] T8.2 Remote plugin (MCP over HTTP) client + manifest format (marketplace groundwork)
- [~] T8.3 Notifications (permission, exact alarms, background status, test), appearance (system/dark/light, persisted); data export/reset todo

## M9 End-to-end
- [ ] T9.1 E2E on emulator: login → ask balance → build dashboard widget → low-balance check job → notification fires
- [ ] T9.2 E2E: timetable sync → class reminder; "remind me every 3 days, 16 times"
- [ ] T9.3 Polish pass with `impeccable` + design review checklist; README for contributors
