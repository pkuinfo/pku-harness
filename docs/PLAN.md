# pku-harness Plan

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done (with date). Update this file as work lands.
Each task ends with: typecheck + lint pass, and (for UI) a screenshot check on the Android emulator.

## M0 Foundation
- [x] Expo SDK 58 scaffold with bun, Expo Router (2026-10-18)
- [x] ARCHITECTURE.md, DESIGN.md, PLAN.md, repo CLAUDE.md/AGENTS.md (2026-10-18)
- [ ] T0.1 Toolchain: JDK 17, Android dev build installs and runs on emulator
- [ ] T0.2 Clean template: remove demo screens/assets, set app name/id/scheme, dark splash
- [ ] T0.3 Tooling: tsconfig paths, ESLint (expo lint), `bun run check` (tsc + lint), bun test setup
- [ ] T0.4 First commit + push to `pkuinfo/pku-harness`

## M1 Design system
- [ ] T1.1 Tokens: colors (dark/light), spacing, typography (Inter), radius, shadows, motion; `useTheme`
- [ ] T1.2 Primitives: Text, Button, IconButton, Surface, ListGroup/ListRow, Chip/Badge, Field, Skeleton, EmptyState
- [ ] T1.3 Motion primitives: AnimatedNumber, Stat, press feedback hook, stagger helper, haptics wrapper
- [ ] T1.4 AgentOrb (Skia/Reanimated) and custom TabBar with animated pill
- [ ] T1.5 4-tab shell (Chat, Dashboard, Schedule, Settings) with placeholder screens, verified on emulator

## M2 Core runtime
- [ ] T2.1 Store: expo-sqlite DB with migrations + KV; SecureStore wrapper
- [ ] T2.2 Plugin runtime: definePlugin, registry, tool ids, effects, permissions model, ctx
- [ ] T2.3 Settings: AI provider (base URL, key, model) stored securely; connection test
- [ ] T2.4 Agent loop: AI SDK + openai-compatible provider, streaming via expo/fetch, tool calling, session log
- [ ] T2.5 Chat screen: message list, composer, streaming text, tool-call chips, AgentOrb states

## M3 Generative UI
- [ ] T3.1 json-render catalog + registry styled with our components
- [ ] T3.2 `ui.render` tool; inline rendering in chat; form submit → next agent message
- [ ] T3.3 Custom catalog components: StatCard, Sparkline, ProgressRing, ChoiceList, DateTimeField, PaymentQR

## M4 Campus access
- [ ] T4.1 `modules/campus-http` Expo module (Android/OkHttp): sessions, cookie jars, redirect control, HTTP/1.1, extra trust anchor
- [ ] T4.2 IAAA login in TS (RSA, OTP optional), credential storage, login screen + Settings account row
- [ ] T4.3 Plugin `campus-card`: balance, transactions, payment code
- [ ] T4.4 Plugin `netfee`: network fee balance and usage
- [ ] T4.5 Plugin `timetable`: course table + class times (treehole API), academic calendar
- [ ] T4.6 Plugin `courses`: Blackboard announcements + assignments (read-only)

## M5 Dashboard
- [ ] T5.1 Widget model + persistence; widget renderer with data bindings + TTL cache
- [ ] T5.2 `dashboard.*` agent tools; default starter widgets after first login
- [ ] T5.3 Edit mode: reorder/delete by gesture, pull-to-refresh

## M6 Scheduler & notifications
- [ ] T6.1 Job model + recurrence engine (unit-tested: one-shot, daily times, every N days, count, until)
- [ ] T6.2 Notify executor with expo-notifications (exact alarms on Android), re-arm on start
- [ ] T6.3 Check executor (plugin data source + condition) via expo-background-task; Android exact-time wakeup
- [ ] T6.4 `scheduler.*` agent tools

## M7 Schedule tab
- [ ] T7.1 Timetable view (today / week), class reminders
- [ ] T7.2 To-dos with reminders; jobs list (create/edit by hand)

## M8 Settings & plugins
- [ ] T8.1 Plugins screen: list, enable/disable, per-effect permission switches
- [ ] T8.2 Remote plugin (MCP over HTTP) client + manifest format (marketplace groundwork)
- [ ] T8.3 Notifications, appearance, data export/reset

## M9 End-to-end
- [ ] T9.1 E2E on emulator: login → ask balance → build dashboard widget → low-balance check job → notification fires
- [ ] T9.2 E2E: timetable sync → class reminder; "remind me every 3 days, 16 times"
- [ ] T9.3 Polish pass with `impeccable` + design review checklist; README for contributors
