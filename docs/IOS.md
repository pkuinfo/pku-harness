# iOS readiness

The app is developed and tested on Android. This page records what iOS needs, what is already
prepared in code, and what is left for when a Mac and an iPhone are available. Sources: Expo SDK
58 docs (notifications, background-task), Apple developer documentation (UNNotification,
BGTaskScheduler, App Transport Security, Keychain), checked 2026-10-21.

## Scheduled tasks on iOS

| | Android | iOS |
|---|---|---|
| Reminders (`notify`) | expo-notifications DATE trigger, `delivery: 'alarmClock'` (`setAlarmClock`, never deferred) | Local notification (`UNTimeIntervalNotificationTrigger`), exact, survives a killed app. **At most 64 pending per app**; the system keeps the 64 soonest and silently drops the rest. `interruptionLevel: 'timeSensitive'` breaks through Focus (entitlement in app.json). |
| Checks / AI tasks | Alarm-clock wake-up (notify-kit) + short foreground service, on the minute | **No way to run JS at an exact time without a server.** Runs when the app opens, plus opportunistically from `expo-background-task` (BGProcessingTask; iOS picks the time, often overnight; not in the Simulator; stops if the user swipes the app away). Late runs beyond 2 h are logged as missed. |
| Permissions | Notifications, Alarms & reminders (`SCHEDULE_EXACT_ALARM`), battery | Notifications (alerts, not provisional). Time Sensitive can be turned off per app in Settings; Expo doesn't expose its state. |

Possible later improvement for AI tasks the user expects every time (digests): also arm a Time
Sensitive local notification at the exact time ("到点了，点此查看") that runs the task when tapped.
Not for threshold checks (noise).

## Done in code

- `modules/campus-http` loads with `requireOptionalNativeModule`; `src/core/campus/http.ts`
  throws a readable "not available on this device" error, and the `campus-session` capability
  (`src/core/runtime/registry.ts`) follows the module's presence. An iOS build launches; campus
  plugins show as unavailable until the Swift port exists.
- Keychain items use `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (`src/core/store/secrets.ts`):
  background runs happen while the phone is locked.
- Notification planning caps by platform (`src/core/scheduler/plan.ts` `IOS_LIMITS`: 56 armed,
  fair share per job) so iOS never drops reminders silently.
- Notification content sets `interruptionLevel` (reminders/alerts Time Sensitive, problem
  reports active); permission requests ask for alerts explicitly; provisional counts as not
  granted (`src/core/notify/index.ts`).
- `app.json` `ios`: Time Sensitive entitlement, `usesNonExemptEncryption: false`, ATS exception
  for `pku.edu.cn` (plain-http redirect hops, old TLS), local networking for LAN AI endpoints;
  expo-notifications `enableRemoteNotifications: false` (no `aps-environment` until push is
  used, so a free personal team can sign).
- `DateTimeField` renders the SwiftUI compact `DatePicker` on iOS (the Compose dialogs are
  Android-only).
- Onboarding's permissions step shows only the notifications row on iOS.

## Left for a Mac + iPhone

1. **Port `modules/campus-http` to Swift** (the main gap: 14 campus plugins depend on it). Same JS
   API and `StoredCookie` JSON. One ephemeral `URLSession` per session id with
   `httpCookieStorage = nil`, `httpShouldSetCookies = false`, `connectionProxyDictionary = [:]`
   (no proxy, like Android's `NO_PROXY`); our own cookie jar parsing `Set-Cookie` from every hop;
   redirects handled in Swift (return `nil` from `willPerformHTTPRedirection`, follow ≤ 10 hops,
   302/303 → GET); TLS: on trust failure, rebuild the chain with the embedded AlphaSSL CA 2025
   intermediate (same PEM as the Kotlin module, expires 2027-05) keeping the hostname check;
   multipart from `file://` under tmp/Caches/Documents only, via `uploadTask(fromFile:)`; total
   timeout timer; same error codes. Add `"apple"` to `expo-module.config.json`.
2. Verify notification taps route on a device (expo-notifications and notify-kit both install a
   `UNUserNotificationCenter` delegate; notify-kit forwards ones it doesn't own).
3. Settings: a Time Sensitive explanation row (open Settings), and "background checks run when
   iOS allows; opening the app catches up" copy in the Schedule tab.
4. `background.ts`: add `BackgroundTask.addExpirationListener` to save run state on iOS.
5. Every welcome step needs a visible back control (no hardware back on iOS).
6. Consider one repeating CALENDAR trigger for unbounded daily/weekly reminders without a
   "n/N" label (counts as one of the 64).
