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
- [x] T1.8 Glass + Light design language applied app-wide: PKU VI palette, Aurora backdrop, glass surfaces (semantic tokens), concentric radii, logo replaces the orb, glass tab bar with sliding indicator, collapsing headers, focus-enter, message motion (2026-10-18)

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
- [x] T4.1 `modules/campus-http` Expo module (Android/OkHttp): named sessions with own cookie jars (persisted in SecureStore), manual redirects, HTTP/1.1, no proxy, AlphaSSL CA 2025 extra anchor; verified on device against iaaa.pku.edu.cn (2026-10-18)
- [x] T4.2 IAAA login in TS (RSA PKCS#1 with tests, OTP optional), credentials in SecureStore, Settings → 校园账号 screen; wrong-credential path verified on device with a fake account (2026-10-18). Successful sign-in awaits the user's own login Verified on device with the user's own login (2026-10-18); adaptive second factor (SMS/email/OTP prompt) added.
- [x] T4.3 Plugin `campus-card` (plugins repo): balance + transactions via the portal SSO → synjones-auth JWT chain (harness adapter, 401 refresh); payment code screen (数字卡 switch with explicit confirm, 30 s refresh, screenshots blocked, brightness up; never a tool result, so it never reaches the model) + `setDigitalCard` tool; balance widget with 付款码 button (2026-10-18). Signed-out paths verified; needs a signed-in account to verify the code itself Balance/transactions verified live (2026-10-18).
- [x] T4.4 Plugin `netfee` (plugins repo): balance / usage from its.pku.edu.cn via harness-held ITS session; parser tested. Needs a signed-in account to verify Verified live (2026-10-18).
- [x] T4.5 Plugin `course-sync` (plugins repo): treehole session in the harness (IAAA PKU Helper → JWT), course table + class times → timetable (source campus), SMS/OTP verification steps as tool results + screen; parser tested, signed-out UI verified (2026-10-18). Needs a signed-in account to verify; location parsing waits for a real sample; academic calendar todo Verified live: 11 sessions with rooms parsed from the real notes (2026-10-18).
- [x] T4.6 Plugin `courses` (plugins repo): Blackboard session in the harness (IAAA blackboard → campusLogin, desktop UA, re-login when bounced to login); courses / announcements / assignments (bounded crawl, deadlines, submitted state) + 作业截止 dashboard widget; parsers tested against pkucli's documented DOM (2026-10-18). Needs a signed-in account to verify Courses/announcements verified live after fixing http→https SSO hops (2026-10-18).

## M5 Dashboard
- [x] T5.1 Widget model + persistence; widget renderer with data bindings (`$state` pointers) + TTL cache; loading/error/ready states (2026-10-18)
- [x] T5.2 `dashboard.*` agent tools (list/sources/upsertWidget/removeWidget/reorder) + `calendar` plugin (today, teaching week); starter widgets on first run (2026-10-18)
- [x] T5.3 Edit mode: long-press, drag handle reorder, size cycle, delete; pull-to-refresh (2026-10-18)
- [x] T5.4 Plugin-provided widgets (`contributes.widgets`, `PluginWidget`, `dashboard.catalog` / `addPluginWidget`, widget gallery) + stale-while-revalidate live store (persisted last value, focus / foreground / interval revalidation, dedupe, checks prime it; `host.useToolData`); widgets in campus-card, netfee, timetable (2026-10-18)

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

- [x] T4.7 pkucli services as plugins (parallel agents, parsers tested, 158 tests): `treehole` (forum read/follow/post/reply), `grades`, `campus-events` (talks/activities), `elective` (read-only), `finance` (cwfw, campus network), `room-booking` (bdkj), `course-catalog` (dean + elective query), `calendar` official 校历 + semester sync, campus-card monthly stats, Blackboard content/assignment detail/recordings; harness adapters `bdkj`, `cwfw`, `elective` via the adapter registry (2026-10-18). Live verification in progress
- [x] T4.8 IAAA 手机令牌 authenticator: bind TOTP, auto-fill OTP in sign-ins and course-token exchanges, dashboard widget with hourglass. Bound on the real account; cwfw sign-in auto-filled the code (finance.rewards live); bind success moment + falling-grain hourglass (2026-10-19)
- [ ] T4.9 Host capabilities requested by the ports: public HTTP for plugins (`services.http`, scoped), binary/multipart request bodies + file picker (Blackboard submission), card recharge helper (token-in-body signing)

## M9 End-to-end
- [x] T9.0 Agent E2E on emulator against a scripted OpenAI-compatible mock model: streaming, tool calls (scheduler / dashboard / ui.render form submit / remote MCP write with approval) (2026-10-18)
- [x] T9.1 E2E on device with the real DeepSeek model and the user's account: ask balance → check job created and run → real notification "校园卡余额不足 ¥600（当前 ¥513.35）"; memory, todo, generative form → reminder (2026-10-18)
- [x] T9.2 E2E: "every 3 days, 16 times" verified end to end (agent + form → 10 exact alarms in the 14-day window); class reminders verified with manual courses (odd-week cadence); course-sync on the real account (11 courses with rooms) (2026-10-18)
- [x] T9.3 Read-tool matrix on the real account (37 tools via the dev deep link + logcat runner): all pass except treehole (needs the user's SMS code) and elective supplements/search (empty outside the add/drop window). Fixed on the way: dean course-catalog dropdown markup, calendar Vite bundle, bdkj 2026 site, write → cached-read invalidation (2026-10-18)
- [x] T9.4 UI sweep on device, both themes: tab bar layout regression, plugins-screen icon crash, collapsed-header bleed-through, folded tool-call log, nested genui cards, zh-CN dates (Hermes ignores the locale), authenticator consent text, widget number/label consistency (2026-10-18)
- [~] T9.5 Treehole SMS verification done by the user, treehole read tools live; `elective.*` untestable mid-semester (site closed); pay-code screen verified on the real account (QR, balance, 30 s refresh; confirmed by the user); exact-alarm permission still open (2026-10-19)
- [~] T9.3 README for contributors done (2026-10-18); every screen checked on the emulator in dark and light; full impeccable review pass todo
- [x] T9.6 Performance pass on a release build (emulator, `top -H`, Hermes sampling profile via the inspector proxy). Streaming: Markdown lexes only the unfinished tail (`streamLexer`, 10× less lexing on a 4.6k reply), only the message list subscribes to tokens, stable FadeIn animations, one save timer per quiet period; peak JS ~70% → ~50%, main thread ~58% → ~25%, taps answer mid-stream. Idle: the Skia aurora (TextureView the blur couldn't capture, ~110 errors/s) became gradient views that rest when the app is idle, and the logo's orbit no longer leaks after a reply; idle main thread ~53% → ~4%, RenderThread ~60% → 0 (2026-10-19)

## M11 Agent harness core (spec: docs/AGENT-HARNESS.md)
- [x] T11.1 Sessions: multi-session store (migration 2, per-session records, flush on background), per-session model, background replies + unread + notification, auto titles, sessions sheet (search, sections, swipe delete + undo, rename, pin), edit & resend, interrupted turns marked on load (2026-10-21)
- [x] T11.2 Slash commands: registry (built-ins + plugin `contributes.commands`, Chinese aliases, collision namespacing), parser, fuzzy / menu; 14 built-ins; /余额 /今天 /树洞 plugin commands (2026-10-21)
- [x] T11.3 Composer: attachments (camera/photos/text files, modality-gated), long paste → chip, full-screen editor, 100k limit, send/stop/queue with pause, model picker sheet, per-session drafts (2026-10-21)
- [x] T11.4 Context management: static system prompt (time in per-turn context), stable tool order, 上下文预算 (64k default), prune → summarise → commit compaction, /compact, tool-output capping, overflow recovery (2026-10-21)
- [x] T11.5 Usage & context visualization: per-request recording (migration 3), context ring + sheet, usage screen (KPIs, 20-week heat map, hour-of-day, 14-day tokens, tools, models) (2026-10-21)
- [~] T11.6 Device pass (picky): swipe-delete bleed-through, context total, partial-command send, model picker sizing, stale cleared drafts, duplicate interruption UI fixed; full pass of attachments / queue / compaction / usage screen pending (2026-10-21)
- [~] T11.7 First-run onboarding: 3D welcome, then AI service → PKU sign-in → plugin picks → done (resumable) (in progress)
- [x] T11.8a On-demand tools: core plugins + `tools__load`, plugin catalog in the system prompt; a new chat's request went from ~30k to ~10k tokens (2026-10-21)
- [ ] T11.8b Chart palette as theme tokens; compaction notice uses the same calibrated numbers as the context sheet

## M12 Plugin batch 2 (in progress, 2026-10-21)
- [~] T12.1 Money & utilities: cwfw expansion (salaries/rewards, tuition, tax), dorm electricity / water / bath balances + cashier recharge
- [~] T12.2 Blackboard depth: assignment submission (host multipart + file picker), grades, due-date → to-dos, 智云课堂
- [~] T12.3 Library: loans + renew, seat reservation, catalog search, hours
- [~] T12.4 Campus life: notices (official sites / info-spider), shuttle timetables, canteens, portal apps
