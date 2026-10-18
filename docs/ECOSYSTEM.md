# Expo / RN community packages (survey 2026-10-18)

Candidates for pku-harness (Expo SDK 58, RN 0.88 New Architecture, Reanimated 4, RNGH 3).
Versions and adoption numbers as of the survey date; re-check before adopting.

| Area | Package | Verdict | Why |
|---|---|---|---|
| Exact-time JS while app is killed | `react-native-notify-kit` (maintained Notifee fork) | **adopted (T6.5), verified on device** | AlarmManager / alarm-clock triggers, `DELIVERED` headless event on Android, Expo config plugin, New Arch only. Notifee itself was archived 2026-04. |
| | own Expo module (alarm → `HeadlessJsTaskService`) | fallback | ~150 lines Kotlin + config plugin if notify-kit fails on SDK 58 bridgeless. |
| | `expo-background-task` | keep | Periodic refresh only (WorkManager, ≥ 15 min, inexact). |
| Home-screen widgets | `expo-widgets` (first-party) | try first | Android + iOS `createWidget`, @expo/ui Compose. |
| | `react-native-android-widget` | fallback | Mature JS-rendered Android widgets with headless task handler. |
| Sortable lists/grids | `react-native-sortables` | use | Grid + flex sortables on Reanimated; dashboard tiles. |
| Chat markdown | `react-native-enriched-markdown` + `react-native-streamdown` | use | Native rendering, streaming LLM output. |
| Charts | `victory-native` (XL, Skia) | use | Sparklines and live numbers on dashboard. |
| Toasts | `sonner-native` | use | Reanimated 4 toasts. |
| Sheets | `@expo/ui` ModalBottomSheet; `@lodev09/react-native-true-sheet` | use / fallback | Native sheets. |
| QR code | `react-native-qrcode-svg` | use | Campus-card payment code (T4.3). |
| KV storage | `react-native-mmkv` | maybe | Fast sync KV; SQLite stays for relational data. |
| MCP client | `@modelcontextprotocol/sdk` (Streamable HTTP + `expo/fetch`) | use for T8.2 | Remote marketplace plugins. |
| Voice | `expo-speech-recognition` | use | Voice input in chat. |
| On-device AI | `react-native-executorch` | later | Offline classification / summaries. |
| Avoid | `@notifee/react-native` (archived), `burnt` (stale), `react-native-background-actions` (FGS policy risk), `react-native-draggable-flatlist` (stale) | | |

Unverified on device: notify-kit killed-app `DELIVERED` under SDK 58 bridgeless, expo-widgets
Android layout coverage, MCP SDK polyfills on Hermes. Spike each before committing.
