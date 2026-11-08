# Copilot mode

Copilot is a normal Harness plugin backed by a Harness-owned Expo native module. The user's
architecture requirement permits source reuse from Mika, with acknowledgment, but forbids
calling Mika project modules, plugins, or packages. This implementation adapts reusable
Android mechanisms into our own packages and runs them behind our own session engine and
platform contract. It does not require the Mika app, checkout, service, or database.

## Architecture

```mermaid
flowchart TD
  Plugin[Copilot plugin: saved setup and typed tools] --> SDK[SDK PhoneService]
  Plugin --> Preferences[Plugin KV: enabled state and allowed apps]
  SDK --> Host[Harness host service and run ownership]
  Host --> Expo[Expo PhoneControl adapter]
  Expo --> Engine[Harness PhoneEngine]
  Runtime[Agent activity and approval queue] --> Expo
  Expo --> Floating[Native floating status, preview and controls]
  Floating --> Engine
  Engine --> Port[DevicePort contract]
  Port --> Android[AndroidDevicePort]
  Android --> Accessibility[Harness accessibility component]
  Android --> Helper[Harness helper and Binder interface]
  Android --> Display[Display and task management]
```

- `plugins/plugins/copilot` owns the setup/session screen, `/copilot` command, typed tools,
  instructions, settings contribution, and persisted enabled/app-selection preferences in its
  own KV store. The `configure` tool is user-only; the agent cannot change or widen this scope.
  The plugin uses the SDK, React, and React Native.
- `plugins/packages/sdk/src/phone.ts` defines the host capability without native implementation
  types. `src/core/phone` binds it to the Expo module and assigns a session to one agent run.
- `modules/phone-control/android/src/main/java/org/pkuinfo/harness/phone/core` owns session
  scope, observation identities, fresh-screen checks, concrete action assessments, cancellation,
  pause/resume, handoff, and cleanup. It has no Android, Expo, or implementation-package imports.
- `DevicePort` and `DeviceSession` define the platform boundary. `AndroidDevicePort` translates
  between those contracts and the internal Android mechanisms. Adapted source is kept inside
  Harness-owned `platform`, `helper`, `connection`, `transport`, `policy`, and `ipc` packages.
- The Expo bridge translates typed operations and results. The generated `android/` project
  is not edited by hand; native declarations and helper keep rules live in the local module.
- `CopilotService` owns the native session lifetime and default accessibility-overlay controls.
  Host adapters mirror current agent activity and pending Copilot approvals into that overlay;
  answers are matched to both the current session and approval ID. These controls are
  Harness-owned and do not invoke a Mika overlay or plugin.
- Existing Harness storage remains the host storage service. Native pairing credentials stay
  inside this app's private storage and Android keystore. No Mika storage or database is read.

This is not a claim that every Android mechanism was written from scratch. Reused source
retains its origin and license headers. The architecture, exported contracts, session rules,
package ownership, and integration are Harness-owned.

## Session behavior

Use `/copilot` or plugin settings for one-time setup. Keep Android's wireless-pairing dialog
open in split screen while entering its port and code; discovery also has an optional manual
port fallback. The screen displays translated connection states and recovery hints.

Select allowed apps using their installed Android icons, names, and native switches. App
choices save immediately. Enable Copilot once, then describe jobs in chat without manually
starting a new session for each job. Turning Copilot off stops the current phone session while
retaining app choices. Changing scope closes any active session before the new scope is used;
configuration changes and session creation are serialized.

System UI (`com.android.systemui`) and Settings search
(`com.google.android.settings.intelligence`) are explicit companion choices when installed.
They may show controls opened by another app without exposing their own launcher activities.
The UI labels these entries as system dialogs; selecting Settings does not silently authorize
its companion packages. The agent must not try to launch a nonlaunchable companion directly.

The agent calls `status` for readiness, saved scope, and any active session. When enabled but
idle, `start` creates a lazy native session from only the saved packages. This setup operation
does not launch, read, or operate an app. It makes the floating controls available before the
first app-operation approval. Actual launch, input, submission, and other effects retain the
user's existing approval modes. No agent-supplied package list is accepted by `start`.

Floating controls are the default during a phone session. The user can stay in another app on
the main display while Copilot operates selected apps on its separate display. The collapsed
control expands to show current agent activity, a local app preview, pause/resume, stop,
optional takeover/return, and pending approvals. The window does not take keyboard focus and
allows touches outside it to reach the underlying app. The foreground-app guard refuses to
move an app the user is currently using; concurrent work targets other selected apps.

When Harness is in the background, its existing Copilot approval request is mirrored into the
floating panel with the observed target and relevant action details. Allow once or Deny answers
that same request; it does not change saved permission modes. When Harness is foregrounded,
the usual in-app approval sheet remains the approval surface. The in-app Copilot panel remains
available for preview and controls. Full background behavior still requires the E2E checks below.

Observations issue fresh snapshot IDs and element references. Actions must match the current
snapshot and a fresh screen. Sliders expose their observed range and support `setProgress`;
editable fields use a field-bound `submit` action. An uncertain dispatch consumes the old
reference and is not retried by the session engine. Unknown or unselected app windows block
operations. Reopening a selected app is permitted for recovery; an explicit restart can reset
an agent-owned app task when ordinary launch restores the blocked screen, but must not discard
unsaved user work. Passwords, protected screens, and payment confirmation require user handoff.

Physical device brightness uses separate typed `readBrightness` and `setBrightness` operations.
The virtual display's Settings page can omit hardware brightness controls, so this capability
addresses Display 0 through the authenticated Harness helper without opening Settings or
handing over the user's screen. It accepts only a bounded percentage and optional adaptive
mode—not arbitrary setting names, commands, or display IDs. The session must be active,
unlocked, not handed over, and include Android Settings in its selected scope; pause gates
the operation and cancellation/Stop still apply. Companion packages are needed only when
interacting with their UI, not for this typed brightness path.

Percentages use the AOSP SettingsLib perceptual gamma conversion with the physical display's
reported minimum/maximum bounds. They are not raw `screen_brightness / 255`. Omitted adaptive
mode preserves the current mode; an explicit value changes it. The helper writes once, then
polls readback briefly without repeating the mutation. It returns before/after state and a
verification flag. The model must check readback before claiming success; a separate read can
verify the state again, and adaptive mode may subsequently change the level. An uncertain result does not authorize a blind repeat write.

Preview images stay local: they are not saved by the feature or returned in model tool results.
The native preview polls only when expanded and appropriate for the current session state;
the in-app preview polls only while its screen is focused and Harness is active. Handoff moves
the task to the user's screen only when explicitly requested or needed for a manual step.
Normal completion releases run ownership while retaining a deliberately handed-over or paused
session. The user can return control and send another message. Ordinary completion, error, and
step exhaustion close a session that is neither handed over nor paused. Cancellation closes it
in either state.

Stop invalidates the session immediately, then serializes cleanup after an in-flight action.
The current agent run cannot silently start a replacement after the user stops it. Cleanup
preserves ordinary app tasks where the Android mechanism supports it, restores the clipboard,
releases the display, and stops the foreground service. Helper or accessibility loss also
requests cleanup. A stale stop request cannot close a newer session.

The plugin requests 40 model steps through the shared `maxAgentSteps` contract (default 10,
host maximum 60). Only a plugin actually used in a run can extend that run's allowance.
Scheduled tasks cannot access Copilot sessions.

## Attribution and platform references

### Reference review (2026-11-08)

The cloned DSH Go revision `9be93dd9` was reviewed alongside Mika revision `9fbbc89e`:

- DSH Go's `phone/PhoneTasks.kt` separates task identity, pause, in-flight calls, and stop.
  Harness retains its own session IDs and run leases; stopped sessions cannot be silently
  restarted by a model retry, and deliberate handoff survives normal reply completion.
- DSH Go's `phone/background/BackgroundGateState.kt` rejects results from superseded probes.
  Copilot now independently versions screen reads: delayed status/preview results cannot
  replace a newer stop, handoff, refresh, or navigation state. Polling pauses during user actions.
- DSH Go's `phone/PhoneTaskReturn.kt` distinguishes requesting a return from actually being
  visible. This remains a device-verification requirement for Harness handoff/resume, not an
  assumption inferred from a successful Android call.
- Mika's `core/action/ActionOutcome.kt` and `core/agent/OutcomeJudge.kt` distinguish dispatch,
  observed effects, and task completion. Copilot's tool instructions now explicitly require
  observed evidence, forbid blind retries of uncertain submissions, and call for handoff when
  repeated observations make no progress. This is guidance, not an automatic success judge.

DSH Go is AGPL-3.0 licensed. This review uses its design ideas; no DSH Go source was copied
into Harness. Mika adaptations retain the module's existing source attribution and license.

The earlier integration merged app `master` (including the thinking display and release 1.0.3
configuration) and plugin `main`; the app default branch is now `main`. That integration did
not tag or publish a new APK release.
Post-merge verification: app typecheck/lint and 1,630 tests passed (3 skipped); plugin
typecheck, registry/document validation, and 1,233 tests passed. Earlier native build evidence
below predates this merge. Current device evidence and remaining checks are recorded below.

Selected Android mechanisms were adapted from Mika revision `9fbbc89e`, under Apache-2.0.
The module's `LICENSE` and `NOTICE` retain attribution; the root README thanks Mika and its
contributors. No Mika application, agent loop, model client, browser, or Linux runtime is a
runtime dependency.

Official documentation consulted:

- https://docs.expo.dev/versions/v58.0.0/
- https://docs.expo.dev/modules/overview/
- https://docs.expo.dev/modules/module-api/
- https://docs.expo.dev/modules/android-lifecycle-listeners/
- https://developer.android.com/reference/android/accessibilityservice/AccessibilityService
- https://developer.android.com/reference/android/app/ActivityOptions
- https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start

## Verification and remaining work

Latest main verification: 1,658 passed, 3 skipped; plugin verification: 1,245 passed;
native JVM tests: 34 passed. Typecheck and lint passed in both repositories.
The requested emulator browser, brightness, floating-control, and concurrent-use cases passed;
wireless pairing and broader physical-device coverage remain unverified.

- [x] Plugin UI/tools and SDK capability wired through a local Expo module.
- [x] Harness-owned engine and platform contract are connected to the Expo bridge.
- [x] Native source, manifest, AIDL, and keep rules contain no Mika package references.
- [x] Debug APK builds; DEX inspection finds the Harness engine and helper and no
  `com.wangzan101.mika` packages.
- [x] The original fifteen native JVM tests passed: successful dispatch, stale-screen and approval rejection,
  app scope, secret/protected-screen handling, uncertain dispatch, cancellation, handoff,
  replacement-session isolation, failed setup cleanup, and action classification in English
  and Chinese, including generic confirmation on a payment screen.
- [x] Architecture regression tests enforce package independence and the pure core boundary.
- [x] Harness typecheck/lint and tests after the rewrite: 1,414 pass, 3 skipped, no failures.
- [x] Final debug/release builds and minified helper/package verification after the rewrite.
- [x] Approval permissions are rechecked after classification, after waiting, and before dispatch. Observed target
  labels/packages are now shown separately from tool arguments; cancellation removes queued
  requests, including while a preference is being saved. Invalid classification is rejected.
  Regression tests caught and fixed a missing snapshot ID in the native policy adapter.
- [x] Emulator helper startup through the packaged USB script and accessibility binding.
- [x] Original browser search/submit, explicit handoff, handback to preview, and clean stop.
- [x] Background observation of existing Chrome results while Clock remained on the main display.
- [x] Earlier switch-list UI inspected in light and dark themes.
- [x] Fresh background Chrome search from a model prompt, automatic start from saved scope,
  floating submission approval, pause → approve while paused → resume, live results preview,
  and completion cleanup while Clock remained usable on the main display.
- [x] Current app-icon picker inspected in light/dark themes with selections preserved.
- [x] Floating Stop while submission approval was pending canceled the native session and
  agent run, removed the approval, and left only Clock on Display 0.
- [x] A subsequent user message started a fresh session; denying a floating submission
  approval produced a tool rejection, truthful no-submission response, and clean end.
- [x] Typed physical-display brightness change to 70%, independent agent readback, and
  Android Settings confirmation while Clock remained foreground.
- [x] Saved setup → automatic lazy start → task completion for the fresh browser search.
- [x] A subsequent brightness task automatically started from the saved scope without manual setup.
- [x] Native operation-status labels observed on device.
- [x] Compact Working/Review bubbles and expanded approval controls verified in light/dark themes.
- [x] Final release build installed; Pause → Stop during pending approval settles the tool
  card to the localized stopped error without an activity spinner. A fresh subsequent search
  auto-started, completed, verified results, and cleaned up while Clock stayed usable.
- [ ] Wireless pairing and broader cancellation/task-preservation coverage on device.

The rewritten architecture's release build passed. DEX/mapping inspection confirmed that the
Harness helper, accessibility entry point, handoff provider, and engine survive minification,
the feedback resource is packaged, and no Mika packages remain. Final debug/release builds
also passed with the approval permission rechecks and classification fix. Integration
coverage at that stage was limited to builds; the subsequent device evidence is below.

The user subsequently authorized testing once the emulator was free. The release APK was
installed with `adb install -r` (no data reset), launched, and its Copilot setup screen inspected
through mobile-mcp. Android enabled the accessibility service, and the packaged helper started
through the generated USB/ADB script and connected to Harness. This does not verify wireless
pairing or the full agent action loop.

Mobile-mcp's default persistent `mobilecli.DeviceServer` suppressed Android accessibility
services during testing. Stopping that test daemon and using `MOBILEMCP_LEGACY_ROBOT=1`
restored Copilot's bound service. Legacy screenshots use device ID `emulator-5554`; prefer
screenshots over hierarchy dumps during active sessions so automation does not suppress the
service under test.

The latest-main release (1.0.3, versionCode 4) was built and installed without clearing data.
The earlier app-selection UI used native switches in labeled grouped rows, with selected count
and a manual Start button above the list. The current implementation replaces that button with
persisted Enable Copilot setup and adds installed app icons. The earlier light/dark screenshots
and Chrome/Clock/Settings selection checks passed alongside native tests (15), plugin tests
(1,233), and app tests (1,630 passed, 3 skipped). These counts describe that earlier build.
The current icon picker was subsequently inspected in both themes and preserved its selections:
`/tmp/copilot-e2e-evidence/app-icons-current-light.png` and
`/tmp/copilot-e2e-evidence/app-icons-current-dark.png`.

The live model completed a Chrome search for Peking University after the field-bound editor
submit action was added. Google results and the official PKU website link were visible after
an explicitly requested handoff; returning control showed the same results in the preview.
The session then stopped cleanly. Evidence: `/tmp/copilot-e2e-evidence/browser-search-handoff.png`
and `/tmp/copilot-e2e-evidence/browser-handback-preview.png` on the development host.

An initial background trial read existing Chrome results while Clock remained on the main
display. A subsequent fresh test used the actual model prompt: “Use Copilot to search Chrome
for PKU library. Verify results. No handover.” The agent automatically started from saved app
scope, while Clock's stopwatch and lap controls remained usable on Display 0 and Chrome ran
on Display 8. The floating submission approval was opened, the session was paused, approval
was granted while paused, and the session was resumed. The live preview then showed Google
results for PKU library, including the official library result. Completion cleanup left Clock
in the foreground; no handover was requested or needed for this case.

Evidence on the development host:

- `/tmp/copilot-e2e-evidence/floating-search-approval.png`
- `/tmp/copilot-e2e-evidence/floating-paused.png`
- `/tmp/copilot-e2e-evidence/floating-search-preview.png`
- `/tmp/copilot-e2e-evidence/main-clock-after-search.png`

This verifies that fresh background browser flow, including its pause/approval/resume sequence.
It does not establish every app or cancellation case. Native operation status was subsequently
verified showing “Opening an app” and “Planning the next step / Last action: Scrolling the app”
with a Settings preview while Clock remained on the main display. Evidence is saved as
`/tmp/copilot-e2e-evidence/floating-native-opening-status.png` and
`/tmp/copilot-e2e-evidence/floating-native-planning-preview.png`. Compact Working/Review
bubble labels and expanded approval controls were subsequently verified in both themes.

The brightness UI attempts initially failed. The reader omitted the range control, Settings
search introduced an unselected package, and a subsequent run encountered an unselected
System UI window. Even with all three Settings-related packages selected, the virtual-display
Settings page reached Display & touch but exposed no hardware brightness slider. These failed
attempts were reported truthfully and motivated the typed physical-display capability above.

The subsequent brightness E2E passed using a fresh actual-model prompt: “Use Copilot to set
brightness to 70%. Verify it. No handover.” The agent automatically started from the saved
scope, read 82.8%, set 70%, made a separate read confirming 70%, and ended the session. Clock
remained on the main display with its stopwatch running. Independent ADB inspection showed
raw brightness changing from 102 to 53, with mode 0 (manual); an independent Android
`DISPLAY_SETTINGS` screen showed “Brightness level 70%”. The raw value differs from the
perceptual percentage by design. After recording evidence, the test restored the baseline
raw value 102 and manual mode 0.

Evidence on the development host:

- `/tmp/copilot-e2e-evidence/brightness-background-completed.png`
- `/tmp/copilot-e2e-evidence/brightness-agent-verification.png`
- `/tmp/copilot-e2e-evidence/brightness-70-system-settings.png`

A Stop test interrupted the session while a floating submission approval was pending. Native
cleanup and agent-run cancellation completed: the approval disappeared, only Display 0
remained with Clock foreground, and chat showed the stopped task with retry available. This
found a separate presentation bug: an old tool card could retain its activity spinner after
the run had stopped. The final release build includes the fix. Its installed-device smoke check passed:
a paused pending submission became a localized stopped tool error with no running-tool spinner.

Stop evidence on the development host:

- `/tmp/copilot-e2e-evidence/floating-stop-pending-dark.png`
- `/tmp/copilot-e2e-evidence/floating-stop-keeps-clock.png`
- `/tmp/copilot-e2e-evidence/floating-stop-agent-cancelled.png`

A subsequent new user message automatically started a fresh session. Denying the PKU museum
search submission from the floating controls produced a tool rejection. The assistant
truthfully reported that it had not submitted the search, then ended the session without
handover. This verifies denial handling and the ability to start again only on a new user
request after Stop. Compact Working/Review bubbles and expanded approval controls were
inspected in both light and dark themes.

Denial evidence on the development host:

- `/tmp/copilot-e2e-evidence/floating-deny-pending.png`
- `/tmp/copilot-e2e-evidence/floating-deny-agent-result.png`

The browser, brightness, Stop, and Deny cases have device evidence for simultaneous phone
use. On the final installed release, a fresh request after Stop automatically started a new
session, submitted the PKU library query through floating approval, verified Google results,
and ended without handover. Clock remained foreground; its stopwatch and Lap controls worked.
The final completion notification appeared over Clock, and only Display 0 remained after cleanup.
The final smoke run completed before a results-preview screenshot was captured; the earlier
live-preview evidence above covers that unchanged native preview implementation.

Final-build evidence:

- `/tmp/copilot-e2e-evidence/final-stop-no-spinner.png`
- `/tmp/copilot-e2e-evidence/final-paused-approval.png`
- `/tmp/copilot-e2e-evidence/final-fresh-search-approval.png`
- `/tmp/copilot-e2e-evidence/final-search-clock-completion.png`
- `/tmp/copilot-e2e-evidence/final-search-agent-result.png`

Final release: `:phone-control:testDebugUnitTest :app:assembleRelease`, x86_64, successful in
6m 7s; installed with `adb install -r`. APK SHA-256:
`096eb2c4f2a524979509aae75fa89d6184a3e6cc43b6d1ada896f54e901fedae`.
Build/test logs are `/tmp/copilot-final-release.log`, `/tmp/copilot-final-main-verify.log`,
and `/tmp/copilot-final-plugin-verify.log`. Brightness was restored to raw 102/manual mode,
and the test stopwatch reset. Saved Copilot configuration remains enabled.

These results establish the requested emulator experience, not universal app compatibility.
Wireless pairing, reboot recovery, and broader physical-device/OEM coverage remain unverified.
