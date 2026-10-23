# PKU Harness

[![CI](https://github.com/pkuinfo/pku-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/pkuinfo/pku-harness/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/pkuinfo/pku-harness?color=8B0012)](https://github.com/pkuinfo/pku-harness/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-8B0012.svg)](LICENSE)
[![Expo SDK 58](https://img.shields.io/badge/Expo-SDK%2058-000020.svg)](https://docs.expo.dev/versions/v58.0.0/)

**An open-source, AI-native app for campus life at Peking University.** Sign in once with your
PKU account and hand your timetable, campus card, network fee, Treehole, courses, finance and
room bookings to an AI assistant that runs on your phone.

The app itself is a **harness**: an agent loop, a design system and a set of host services. Every
capability comes from **plugins**, and built-in and community plugins are equal.

[Download](https://harness.novadiffusion.com/download) ·
[Website](https://harness.novadiffusion.com) ·
[Plugins](https://github.com/pkuinfo/pku-harness-plugins) ·
[Architecture](docs/ARCHITECTURE.md)

## Highlights

- **Chat.** Streaming answers that call plugin tools and render native UI inline (forms,
  pickers, cards). Multiple sessions with automatic titles, `/` commands, attachments, queued
  messages, per-session models, automatic context compaction and a usage board with cache-hit
  statistics.
- **Dashboard.** Widgets the assistant builds and maintains for you, with live data (campus card
  balance, network fee, canteen crowds, …).
- **Schedule.** Timetable, to-dos and reminders with free-form recurrence ("every 3 days, 16
  times") delivered on the minute by the system alarm clock, plus scheduled checks the assistant
  can set up from chat.
- **Plugins as documents.** A plugin is a folder with a `PLUGIN.md`: YAML steps and safe
  expressions that the app interprets. No code runs, installs are links, and updates are data.
  See [docs/PLUGIN-LANGUAGE.md](docs/PLUGIN-LANGUAGE.md).
- **Permissions you can read.** Every tool declares its effect (read, change, money, public); you
  choose per plugin whether the assistant may act, must ask first, or never acts.
- **Share your payment code.** Lend your campus-card payment code to a friend through an
  end-to-end-encrypted relay: codes are made on your phone, the server can't read them, and a
  spend cap and PIN keep it safe. See [docs/CLOUD.md](docs/CLOUD.md).
- **Over-the-air updates.** Signed JavaScript updates from our own server; native releases ship
  as signed APKs on GitHub. See [docs/OTA.md](docs/OTA.md) and [docs/RELEASE.md](docs/RELEASE.md).

## Privacy by design

Your campus credentials, authenticator secret and AI key stay in the phone's secure storage. You
bring your own model key (DeepSeek by default, or any OpenAI-compatible endpoint), so no server of
ours sees your prompts. The optional cloud service only relays and stores end-to-end-encrypted
data for features like code sharing, and it knows your device only by an anonymous key.

## Download

Android 7.0 or later (arm64): **[harness.novadiffusion.com/download](https://harness.novadiffusion.com/download)**,
or the [latest GitHub release](https://github.com/pkuinfo/pku-harness/releases/latest). Every APK
is built by GitHub Actions from a tagged commit and signed with the same key; the release notes
list the APK and certificate fingerprints. iOS support is being prepared ([docs/IOS.md](docs/IOS.md)).

## Quick start (development)

Requirements: [Bun](https://bun.sh), JDK 17, the Android SDK and an emulator or device.

```bash
git clone --recurse-submodules https://github.com/pkuinfo/pku-harness.git
cd pku-harness
bun install
bun run verify         # typecheck + lint + tests: exactly what CI runs
bun run android        # development build on an emulator or device
```

Afterwards, `bunx expo start --dev-client` starts Metro for the installed development build.

### Without campus network or a model key

- Dev-only deep links run tools and chat turns on a device:
  `pkuharness://dev?tool=scheduler.preview&input=<json>` and `pkuharness://dev?chat=<text>`
  (add `&actor=agent` to exercise the ask-first prompts).
- Point **Settings → AI provider → OpenAI-compatible** at any compatible server (a local mock
  works) to run the agent loop end to end.
- `plugins/examples/demo-canteen` is a runnable remote (MCP) plugin.
- If your machine runs a system proxy, start the Android emulator without inheriting
  `HTTP_PROXY`; campus services must be reached directly.

## How it works

| Topic | Document |
|---|---|
| Layers, plugin model, agent, storage | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Sessions, commands, composer, context, usage | [AGENT-HARNESS.md](docs/AGENT-HARNESS.md) |
| The plugin language (`PLUGIN.md`) | [PLUGIN-LANGUAGE.md](docs/PLUGIN-LANGUAGE.md) |
| Cloud: protocol, relay, card sharing | [CLOUD.md](docs/CLOUD.md) |
| Design tokens, components, motion, review checklist | [DESIGN.md](docs/DESIGN.md) |
| Over-the-air updates and releases | [OTA.md](docs/OTA.md) · [RELEASE.md](docs/RELEASE.md) |
| iOS readiness | [IOS.md](docs/IOS.md) |
| Inspecting network traffic | [TRAFFIC-DEBUGGING.md](docs/TRAFFIC-DEBUGGING.md) |
| Roadmap and task status | [PLAN.md](docs/PLAN.md) |
| Code conventions (for people and AI coding agents) | [AGENTS.md](AGENTS.md) |

### Repository layout

```
src/
  app/          routes (Expo Router): tabs, sheets, modal screens
  screens/      screen bodies: chat/, usage/, settings/, plugins/, welcome/
  components/   design-system components: Text, Button, Glass, OptionMenu, charts/, …
  core/
    agent/      agent loop, tools, providers, sessions, context, attachments
    campus/     IAAA sign-in, campus HTTP sessions, service adapters
    cloud/      device identity, provider, encrypted store and channels, consent
    runtime/    plugin registry, permissions, document plugins, remote (MCP) plugins
    scheduler/  reminders, checks, exact alarms, background runs
    commands/ usage/ notify/ dashboard/ timetable/ todo/ store/
  theme/        design tokens (colour, type, spacing, radius, motion)
modules/        our own Expo native modules (campus-http, sms-consent)
config-plugins/ Expo config plugins (release signing, debug user CAs)
plugins/        submodule: SDK, plugins, cloud protocol and reference server
server/updates/ static OTA update server (Caddy)
docs/           design and architecture documents
```

## Related repositories

| Repository | What it is |
|---|---|
| [pkuinfo/pku-harness](https://github.com/pkuinfo/pku-harness) | This app (Expo SDK 58, React Native 0.88, Android first) |
| [pkuinfo/pku-harness-plugins](https://github.com/pkuinfo/pku-harness-plugins) | Plugin SDK, all plugins, the marketplace registry and the cloud server. **Start here to connect a campus service.** Included here as the `plugins/` submodule |
| [pkuinfo/pkuharness-website](https://github.com/pkuinfo/pkuharness-website) | The website: landing page, downloads, developer docs and plugin marketplace |
| [pkuinfo/pkucli](https://github.com/pkuinfo/pkucli) | Reference implementations of PKU service protocols (Rust CLI) |

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. New
campus services usually belong in the [plugins repository](https://github.com/pkuinfo/pku-harness-plugins).
Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in public
issues.

## License

[MIT](LICENSE). PKU Harness is a student project and is not affiliated with or endorsed by Peking
University.
