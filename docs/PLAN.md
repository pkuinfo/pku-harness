# pku-harness Plan

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done (with date). Update this file as work lands.
Each task ends with: typecheck + lint pass, and (for UI) a screenshot check on the Android emulator.

## Agent operates everything (2026-11-11)
- [x] Settings registry (`src/core/settings/registry.ts`, `HostServices.settings`): app settings, AI and voice service, each plugin's switch and per-effect permission, and plugin-declared preferences (`PluginDef.preferences`; Copilot: enabled, apps, screenshots) in one typed list; secrets are `uiOnly`. Core `settings` plugin (`list`, `change`, `open`) under the normal approval modes. ARCHITECTURE §5.1. Verified on emulator-5554 by chat: language/theme/haptics changed and reverted, Copilot's apps read and its write permission changed and reverted.
- [x] Authenticator widget face down by default; a tap flips it over (timed rotate, cross-fade with reduced motion) to the code and hourglass; turns back after a minute or when the app is backgrounded. Both faces the same height.

## Copilot shell input (2026-11-11)
- [x] Route taps, double taps, swipes, scrolls, wheel drags, slider touches, text replacement and editor submission through the display-owned shell helper; add synchronized two-finger input. Remove semantic accessibility actions from the interaction driver. Preserve observation, policy checks and readback.
- [x] Report rejected movement and release the touch at its last delivered position. Reject main-display task input. Add continuous-swipe and partial-failure regression tests.
- [x] Latest-main snapshot passed typecheck/lint and 1,775 tests (3 skipped); release APK built, installed and launched on the original emulator. A probe running the release-compiled helper passed touch, scrolling, two-finger input, Unicode paste, submission, clearing, and main-display rejection checks against a dedicated test activity. This validates the input backend, not a complete LLM-driven WeChat task.
- [x] Review (2026-11-11): removed the code the change left unused (accessibility gesture/tap dispatch, `pathOf`, `inWebView`, `TypingPacing`, `WheelSteps`, the wheel's text/step paths) and added a readback-based correction touch for sliders. Release build on emulator-5554 with real agent runs: Settings search (tap, Chinese typed by paste, submit), Sound page scroll to the bottom, and Media volume set to 80% (12/15, confirmed by `cmd media_session`). 70 Copilot JVM tests pass.
- [ ] Verify signed-in WeChat on the affected physical phone. Neither injected input nor the service compatibility name guarantees undetectability.

## Copilot WeChat compatibility (2026-11-10)
- [x] Built the combined TalkBack service and migration changes in release mode (1066 tasks, BUILD SUCCESSFUL). Verified the temporary APK signature/package identity, installed it on the original emulator-5554, and confirmed `received=true`, `hasBound=true` and no crashed accessibility services. Removed the temporary package and preserved the original installation and enabled service. This confirms release compilation and service binding; it does not replace the pending full agent-loop and physical-phone checks.
- [x] Ran two consecutive DeepSeek chat tasks in the existing production installation on emulator-5554: open Clock and select World Clock, then return to Stopwatch without changing its value. Both agent runs completed; the first recovered from a stale-screen response. Screenshots verified both destinations and the unchanged paused value `00:48.87`. This installation still uses the legacy native service, so this is agent-loop regression evidence, not end-to-end verification of the new TalkBack service.
- [x] Checked the compatibility patch against fetched `origin/main` (`b015154`) using a temporary Git index; it applies cleanly without changing the shared checkout, index or preexisting plugins submodule pointer.
- [x] Verified the full agent loop in a release-signed build with the TalkBack service and migration, installed over 1.0.9 with data kept (2026-11-10). Android drops the old accessibility entry on upgrade; the helper restores it on the next Copilot screen or chat task. With screenshots off, DeepSeek opened WeChat's 语言 page from the signed-out welcome screen, read all 19 languages through observe only, and went back. After an emulator reboot the first chat task restarted the helper. A fresh WeChat start shows nothing for several seconds, so the agent now waits up to 2 × 5 s before treating an app as hidden. Note: mobile-mcp's UiAutomation server unbinds every accessibility service; test Copilot with plain adb.
- [x] Tested official WeChat 8.0.80 (versionCode 3220, Tencent download linked by weixin.qq.com) on emulator-5554 with ARM64 translation. The TalkBack-named Harness service read welcome-screen nodes, clicked Language, and verified the English option in SettingsLanguageUI; instrumentation returned code 0 and the resulting screen was visually checked. No account was entered. UIAutomator's baseline timed out waiting for idle, so no A/B claim is made. Temporary WeChat, probe and test Harness packages were removed afterward. This does not verify signed-in chats or the agent loop.
- [x] Migrate an enabled legacy service even when recovery already marks accessibility applied; preserve other services and disabled/declined choices, report failed writes and retry on reconnect. Explicit enable/disable cleans up both own component names. Five migration regression tests pass (41 native tests total); typecheck/lint pass.
- [x] On emulator-5554, the TalkBack-named service read Clock's accessibility nodes, clicked the World Clock tab and verified the resulting page title. A temporary instrumentation probe returned code 0; probe and test app were removed afterward and the original installation retained. This checks the service's read/click path, not the full agent loop or WeChat-specific node exposure.
- [x] Register the Harness-owned service under the requested TalkBack-compatible class name; update helper recovery, settings routing and R8 together. Preserve app identity, Copilot labels and existing scope/action policy. Typecheck/lint, 36 native tests and release build pass. On emulator-5554, a temporary test package bound the service successfully (`hasBound=true`, connection log, no crashed services), then was removed. The existing release-signed installation was preserved; local generated Android version metadata is stale, so the test build used an external Gradle init script to read app.json and assign a temporary application ID.
- [ ] Verify WeChat's previously empty signed-in tree on the affected physical phone. The user is away from the PC; the signed-out emulator test above does not establish real-device chat access.

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
- [x] T7.2b To-dos v2: priority (important flag) and repeating to-dos (an `every` series; completing creates the next instance, undo removes it), `todo.list` views today/upcoming/all, dashboard widget `todo/today` (sm/md, tick off in place), Schedule list grouped overdue/today/later/no date/done; SQLite migration 4 (2026-11-05). Needs a device check

## M8 Settings & plugins
- [x] T8.1 Plugins screen: list, enable/disable, per-effect modes (auto/ask/off), scopes, tool list (2026-10-18)
- [x] T8.2 Remote plugins: dependency-free MCP Streamable-HTTP client (tested against the official SDK server), manifest cached on device, tools mapped via `z.fromJSONSchema`, effects from MCP annotations, untrusted defaults (write/money/public ask), add/refresh/remove UI, `plugins.*` tools (2026-10-18)
- [x] T8.4 "Ask first" approvals: agent calls whose effect is set to ask raise a native prompt (allow / deny / always allow) over any screen (2026-10-18)
- [x] T8.3 Notifications (permission, exact alarms, background status, test), appearance (system/dark/light, persisted), data export (JSON, no secrets) and full reset (2026-10-18)
- [x] T8.5 Time zone: Settings › 时区 follows the system by default or any zone from a searchable city list (zh/en, offset in force now); one choice drives the SDK clock for agent, scheduler (alarms re-armed on change), to-dos, timetable, ledger, Schedule and pickers; named zones get exact DST through Intl (2026-11-07)

## M10 Plugin ecosystem
- [x] T10.1 `pkuinfo/pku-harness-plugins`: SDK (contract + pure helpers + tests), all bundled plugins ported, registry + schema + validator, remote template, demo-canteen example, CI, CONTRIBUTING; app consumes it as submodule `./plugins` and implements `HostServices` (2026-10-18)
- [x] T10.2 Device capabilities: `requires` on plugins, `HOST_CAPABILITIES`, unavailable plugins hidden from the agent and explained in Settings (2026-10-18) — completes T2.8
- [x] T10.3 Marketplace (设置 → 插件 → 插件市场): registry from jsDelivr/GitHub raw, validated with the shared schema, cached offline; search + filters; bundled shown as installed, remote one-tap install, self-hosted → add sheet prefilled (2026-10-18)
- [x] T10.4 Plugin UI contributions: SDK `HostUI` (design-system components, haptics, navigation, store version hook) + `contributes.screens` / `contributes.settings`; harness mounts them at `/p/<plugin>/<screen>` and lists rows in Settings; AI 记忆 screen moved into the memory plugin (2026-10-18)
- [x] T10.5 Dashboard and Schedule UIs live in plugins: harness tab slots (`contributes.tabs`), modal plugin screens at `/m/<plugin>/<screen>`, richer HostUI (theme, pickers, sheet, genui, sortable list); dashboard plugin owns its tab, new schedule plugin owns the schedule tab + forms; app-owned screens deleted (2026-10-18)
- [x] T10.6 Plugin language (docs/PLUGIN-LANGUAGE.md, spec 1): plugins as shareable `PLUGIN.md` folders interpreted by the harness, install by link, updates as data (2026-10-23)
  - [x] T10.6a SDK `lang/`: schemas, expression evaluator, stdlib, step runner, abilities (incl. verify.treehole, cloud.call), loader, link resolver, CLI `bun run plugin validate|test|run`, recorded tests in CI (2026-10-23)
  - [x] T10.6b App: install store + daily update check (wider access waits), rollback/pin, "Add by link" sheet with permission review + `pkuharness://plugin`, bundled documents, genui ask/open/navigate; verified on the emulator (2026-10-23)
  - [x] T10.6c First ports (TS removed, parity-tested, recorded tests in CI): classrooms, campus-events, grades, canteen, shuttle, notices (2026-10-23)
  - [x] T10.6f course-catalog, elective as documents (parity-tested, TS removed) (2026-11-05)
  - [x] T10.6g library, treehole as documents (parity-tested, TS removed); document screens get route params, translated strings, one-tap SMS fill, tool results and refresh after actions (2026-11-05)
  - [x] T10.6h room-booking, course-sync as documents (parity-tested, TS removed) (2026-11-05)
  - [x] T10.6i finance as a document (cwfw request encoding in shared.yaml via `base64`; `json(text, fallback)`)
  - [x] T10.6j courses as a document: per-tool request budget for the semester crawl, multipart submission from the 交作业 screen (files.pick and submit are `userOnly`; draft revision check), 课程回放 through a `userOnly` play tool (signed URL only to the browser), screen commands (2026-11-07)
  - [x] T10.6k wallet as a document (1.1.0): `cardRecharge` signs its form declaratively (`authIn: form` + `sign`; the card token never reaches the plugin) and opens the cashier only in the browser; the 付款码 screen is `secure` with a 30 s memory-only `refreshSeconds` binding to a `userOnly` payCode tool; `legacy` ids from campus-card / netfee / utilities carry over (verified plugins only); parity-tested, TS removed (2026-11-07)
  - Stay TypeScript (core / host features): calendar, authenticator, card-share
  - [x] T10.6d Agent authoring tools `plugins.reference / validate / tryTool / source / install` (install opens the review sheet) (2026-10-23)
  - [ ] T10.6e `{ fn }` bindings for cloud server functions once `functions.invoke` is live (CLOUD-FUNCTIONS.md)
- [ ] T10.7 Self-hosted, code-signed OTA updates (ARCHITECTURE §14; owned by the website/deploy session)

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
- [x] T11.6 Device pass (picky): swipe-delete bleed-through, context total, partial-command send, model picker sizing, stale cleared drafts, duplicate interruption UI; then long paste (one chip), chip ✕ target, queue + pause/resume, list pinning, full editor focus, text files, /compact, background reply notification (2026-10-21)
- [x] T11.7 First-run onboarding: 3D welcome, then AI service → PKU sign-in → plugin picks → done (resumable); English pass + fixed an SVG gradient-id collision that crashed the AI step (2026-10-21)
- [x] T11.8a Context engineering for the prefix cache: one request prefix (system → fixed tool block → append-only history) shared by chat, title and compaction; on-demand tool loading tried and reverted (it broke the cache); see AGENT-HARNESS §5.1 (2026-10-21)
- [x] T11.9 Cache & cost visibility: usage board prompt-cache section (hit rate, trend, by purpose, saved), spending from published prices, DeepSeek balance (Settings + usage board), default context budget 64k → 128k (2026-10-21)
- [x] T11.10 Memory redesign: taint gate (SDK `ToolDef.untrusted` / `userOnly`, `ctx.turn`) with pending approvals, provenance, sanitize + secrets/instruction filter, retraction lines, deterministic snapshot + `recall`, explicit `replaces` instead of silent merge/eviction, full memory screen; language line unforgeable; see AGENT-HARNESS §5.7 (2026-10-21)
- [ ] T11.8b Chart palette as theme tokens; compaction notice uses the same calibrated numbers as the context sheet

- [x] T11.11 Scheduled tasks hardened: read-only re-check at run time, no prompts for unattended runs, limits + duplicate guard, serialized runs, lateness window, run log + failure alerts/auto-disable, run history in the reminder form and scheduler tools (2026-10-21)
- [x] T11.13 On-time delivery permissions: onboarding step 准时提醒 (notifications, exact alarms, battery; live status, re-read on foreground, skippable with consequence; finish summary), SDK `services.notify.readiness()/fix()` + `deliveryBlocker`, Schedule tab warning banner (2026-10-21)
- [x] T11.12 Agent-driven scheduled tasks: fresh read-only session per run on the shared prefix, NO_REPLY = silent, last-step answer + out-of-steps is a failure, usage purpose 'scheduler'; exact delivery on Android via alarm-clock wake-ups + shortService foreground service (2026-10-21)
- [~] T11.14 iOS readiness (docs/IOS.md): launch-safe without campus-http, keychain after-first-unlock, 64-pending caps, Time Sensitive, ATS, SwiftUI date picker; Swift campus-http port pending

- [x] T11.15 Plugins page: Settings keeps one Plugins card; /plugins is a searchable grid of plugin cards grouped by kind with live status; each plugin page holds its settings screens, permissions, widgets, tools and access (2026-10-23)
- [x] T11.16 One-tap SMS code takeover: modules/sms-consent (Android SMS User Consent, no SMS permission), extractCode, campus verification prompt + Treehole SMS screen + services.sms.awaitCode; iOS via textContentType oneTimeCode (2026-10-23)

## M12 Plugin batch 2 (in progress, 2026-10-21)
- [~] T12.1 Money & utilities: cwfw expansion (salaries/rewards, tuition, tax), dorm electricity / water / bath balances + cashier recharge
- [x] T12.1a Plugin `wallet` (校园钱包): campus-card, netfee and utilities merged into one plugin with a hub screen (every balance as a card, pull to refresh, payment code + top-ups one tap away); SDK `PluginDef.legacy` keeps old plugin / tool / widget ids working (registry aliases, one-time settings carry-over, boot rewrite of stored widgets and checks), tested (2026-10-22). Finance stays separate.
- [x] T12.1b Finance 0.3: 13 more read-only queries. cwfw: monthly scholarships (个人工资), payments to my bank card (我的入卡), reimbursement summary, advances, foreign remittances, FX rates, payroll issued, portal menu; cwpay: pending bills, project catalog, order detail + e-invoice link, spending totals, platform notice. Fixed tuitionFees erroring when nothing is owed. Mirrored in pkucli (`cwfw` subcommands, new `cwpay` crate) (2026-10-23). 到款查询 does not exist for student accounts; use rewards + cardDeposits.
- [~] T12.2 Blackboard depth: assignment submission (host multipart + file picker), grades, due-date → to-dos, 智云课堂
- [~] T12.3 Library: loans + renew, seat reservation, catalog search, hours
- [~] T12.4 Campus life: notices (official sites / info-spider), shuttle timetables, canteens, portal apps
- [x] T12.5 Plugin `ledger` (记账): on-device bookkeeping by keypad sheet or chat (add / addMany with import dedupe / list / summary / update / delete / budgets / categories), month home with donut + daily columns, year report, budget editor, category manager, `month` + `trend` widgets; host chart components for plugins (`ColumnChart`, `LineChart`, `DonutChart`, `Legend`) and a `Chart` genUI element (2026-11-05)

## Copilot mode
- [x] Build Copilot as a plugin over a Harness-owned Android Expo module/session engine, with Mika attribution and no Mika runtime dependencies. Persisted scope, automatic lazy start, floating controls/approvals, app icons, and explicit system companions are implemented. Verified: fresh PKU library search with floating approval, pause/approve/resume, live preview, and cleanup while Clock remained usable; subsequent model-requested brightness change to 70% with separate readback and independent Android Settings confirmation, without handover. Current picker passed light/dark inspection. Latest checks: main 1,658 passed/3 skipped; plugins 1,245 passed; native JVM 34 passed. Floating Stop canceled the session/run during pending approval and kept Clock foreground; a new user message auto-started again, and floating Deny rejected submission with a truthful result and clean end. Compact Working/Review and expanded approvals passed light/dark inspection. Final release built and installed; Pause → Stop clears the tool spinner, and a fresh actual-model search subsequently completed with Clock usable and no handover. Requested emulator cases passed; broader wireless/physical-device coverage is still open. See `docs/COPILOT.md` for evidence and typed physical-display brightness design (2026-11-08).

- [x] Copilot floating UI refinement: native Material-themed compact header, borderless Pause/Stop, overflow menu, single emphasized approval, light/dark palette, scrollable content, and live-preview empty state. Release installed; real-model search, floating approval/pause/resume, live preview, and concurrent Clock use passed. Main verification 1,658 pass/3 skip; native 34 pass (2026-11-08).

- [x] Copilot Pause/Resume and Stop are icon-only, with native long-press tooltips and accessible labels. Verified both themes, pause/resume state changes, Stop tooltip and session cleanup on the installed release; main 1,658 pass/3 skip and native 34 pass (2026-11-08).

- [x] Copilot settings refinement: enable-first layout, collapsible readiness, separate reconnect/pair modes, saved-app filter, compact icons, clearable search, and header refresh. Installed release checked in light/dark and at 130% text size; enable and search/filter interactions passed. Main 1,658 pass/3 skip; plugins 1,245 pass (2026-11-08).

- [x] Copilot modern visual pass: neutral canvas, compact toolbar, flat app rows and underlined tabs through opt-in SDK/host styles. Installed release checked in both themes and at 130% text size; tab interactions passed. Main 1,658 pass/3 skip; plugins 1,245 pass (2026-11-08).

- [x] Copilot app alphabet index: All apps is grouped by initial with a pinned, scrollable letter rail; tap jumps to the group. Search and Allowed apps retain their existing behavior. Latin accents normalize to base letters, other names group under #. C/S navigation checked on the emulator in light/dark; main 1,660 pass/3 skip, plugins 1,247 pass (2026-11-08).

- [x] Copilot asks for an app inline: `copilot.requestApp` (SDK `ToolDef.grant`, `PhoneService.allow`, native `PhoneEngine.allow`) shows "Copilot wants to use <app>" with Allow once / Always allow / Don't allow (floating controls: Allow = once) and adds the app to the running session instead of sending the user to /copilot. Unit-tested (TS + PhoneEngine); Allow once / Always allow checked on the emulator with Settings (2026-11-10).

- [x] Copilot vision fallback for apps that hide their accessibility tree (WeChat): opt-in “Let the AI see screenshots” switch in /copilot (off by default), `copilot.look` (screenshot of the controlled display to a model that reads images, as a transient user-role image never stored in history; protected screens refused), `tapAt`/`typeAt` at screenshot pixels with `ToolDef.alwaysAsk` approval, money/password/scope/freshness checks in `PhoneEngine`. Privacy policy exception added (effective 2026-11-10). Unit-tested (TS + JVM); shipped in 1.0.9 and checked on WeChat with grid taps. With the TalkBack-compatible service it is the backup, not the main path. See `docs/COPILOT.md` (2026-11-10).

- [x] Copilot keyboard fix: the TalkBack-named service made Samsung Keyboard switch to screen-reader typing (two taps per key). The service is now parked between tasks (`AccessibilityParking`: out of the system list after a task and after 20 s idle, written back at `begin` through the app's WRITE_SECURE_SETTINGS or the helper; parks only when it can restore). Emulator: parked after idle, "back on for a task" → task → parked again (2026-11-10).

- [x] Copilot reliability: phone tools are `ToolDef.serial` (one at a time, approval included); disabled is judged on the row a tap reaches, and the error says to turn on the controlling switch; a whole-screen scroll/back acts on the current screen even with an older snapshot (JVM test) (2026-11-10).

- [x] Copilot payment/login handoff that continues by itself: `handoff` takes a note and waits (`PhoneService.handoffAndWait`, native `handoff` + `awaitHandback`) until the user taps **Done · continue** on the auto-expanded floating panel, then returns the settled screen. Emulator: Settings → Display handed over, dark theme switched by hand, Done → the agent read the result without a new message (2026-11-10).

- [x] Mid-turn auto-compaction: after every step the provider-reported prompt size is checked against the budget; over it, the turn stops, commits its steps, summarises older history including the running turn's earlier steps (`compactInTurn`, mode `turn`), and continues. The kept tail is sized from the room the fixed prefix leaves (2026-11-10).

- [x] Reply language follows the user's message (or an explicit request), the app language only as a fallback; tool work before an answer folds into "Worked · N tool calls"; privacy notices are a native bottom sheet; About shows the open-source/free promise and GitHub contributors (2026-11-10).

- [x] Claude-style shell: centred titles without dividers, floating pill tab bar with a sliding selected pill; content scrolls beneath (2026-11-10).

- [x] Voice input (dictation, Claude-style): mic in the composer (in place of send when empty) → words appear while the user talks, live waveform, timer, ✕ / ✓ → transcript into the draft. Native `voice-capture` module streams 16 kHz PCM. Speech services are plugins (`PluginDef.speech`, SDK `stream` / `transcribe`): `aliyun-bailian` (DashScope duplex WebSocket, Beijing; Fun-ASR realtime default, Paraformer v2 cheaper), `siliconflow` (SenseVoice/TeleSpeech, file API: the host sends pieces cut at pauses while the user talks), and a custom OpenAI-compatible endpoint in `openai-compatible`. Measured on a 6.6 s clip: Fun-ASR final text 0.1–0.4 s after speech ends, word-perfect; SiliconFlow 0.5–14 s per request. Keys in SecureStore; privacy policy 2026-11-11 (2026-11-11).

## Full-app UI refinement (2026-11-08)

- [x] Apply the restrained Codex-inspired direction across Chat, Dashboard, Schedule,
  Settings, Plugins, Usage, onboarding, and shared SDK-rendered screens. Three parallel
  review/implementation agents contributed; host primitives now default to a compact
  toolbar, opaque neutral canvas, flatter rows, and quieter typography. Native controls,
  permission flows, app scope, QR/OTP sizes, and financial figures remain available.
- [x] Host verification: typecheck/lint and 1,660 tests passed, 3 skipped. Plugin
  verification: typecheck/registry/bundled-document checks and 1,247 tests passed.
  Release x86_64 build succeeded and was installed on emulator-5554. APK SHA-256:
  `3597ae38c91dcbf0f104ffaef6cca45fe06e4de4e6f2ee7a42849a921c9abcd1`.
- [x] Settled light-theme release captures inspected: Chat conversation/composer,
  Dashboard, Schedule, Settings, Plugins, AI settings, Usage, Wallet, and welcome intro.
  Schedule date/week and plugin counts remain visible in compact header subtitles.
  A capture during focus animation looked faded; a settled direct device capture
  confirmed normal contrast. Subsequent capture workflow waits for transitions.
- [x] Settled dark-theme release captures inspected: Chat, Dashboard, Schedule, Settings,
  Plugins, Ledger, Authenticator setup, and payment-code share form. No layout or contrast
  issue observed in those states; share creation and authenticator setup were not submitted.
  Final shared-primitives code review found no new functional regression.
- [x] 130% font-size inspection passed for Settings, Plugins, AI settings, payment-code
  sharing, and Copilot setup. Restored system font size to 100% and system theme to light.
- [x] Light-theme Chats sheet, model picker, widget gallery, Ledger entry form, and Cloud
  settings inspected. Copilot helper restarted after installation; on-device status shows
  phone helper/accessibility ready with the same four allowed apps. No form was submitted.
- [x] Empty chat, draft typing/clearing, slash-command menu, regular Gboard keyboard
  avoidance, and attachment sheet inspected. No test message sent; keyboard preferences
  restored. Campus, Notifications, Marketplace, and plugin details inspected in light.
  AI settings, Usage, Wallet, and intro inspected in dark.
- [x] Fixed the native attachment sheet remaining over deep-linked screens by dismissing
  it on Chat blur. Rebuilt release installed; open sheet → Usage → return to Chat confirms
  dismissal with no stale overlay. Host verification again passed 1,660 tests/3 skips.
- [x] Theme comparisons passed for the model/session/attachment sheets, widget gallery,
  Cloud, Ledger, Authenticator setup, sharing, Memory, and reminder form.
- [x] Timetable switching and Dashboard edit/Done interactions passed without changing
  records or widget layout. Intro → Skip intro displays readable consent in both themes;
  Agree remains disabled before consent.
- [x] Final installed-release Copilot check: helper/accessibility ready, four allowed apps
  preserved, All apps opens the alphabet rail, and S jumps to the Settings section.
- [x] Publish the verified host and plugin commits to main. Review uses representative UI
  states without resetting the user’s account,
  creating payment links, replacing authenticators, or submitting financial forms. It does
  not repeat the previously recorded phone-control engine tests.

- [x] Dark-mode depth refinement (2026-11-08): stepped charcoal fills, soft panel/control
  shadows, rounded dark list sections and panels (20 px), and buttons/fields (16 px).
  Light styling retained. Installed release inspected on emulator-5554: dark Settings,
  Wallet, AI settings and Copilot; light Settings/Wallet checked for regressions.
  Faint-text contrast across revised dark surfaces is 4.86:1 or higher. Host verification:
  1,660 passed, 3 skipped; release build succeeded. No phone-control logic changed.
  APK SHA-256: `503cab4e73e2f6f84ea0a84ea648484a3d8549ef8f14efddd8b5a7654c4cbb8e`.
- [x] File reading (2026-11-11): PDF / Word / Excel / PowerPoint read into text natively by
  `modules/doc-reader` (system PdfRenderer text on Android 15+, PdfBox-Android below; Office
  via ZipFile + XmlPullParser, JUnit-tested); audio transcribed by the voice-input service.
  Core `files` plugin (`files.list/read/search`) pages through long documents. Verified on
  emulator-5554 (release build): CJK PDF, DOCX, XLSX, PPTX answered correctly; scanned PDF refused.
