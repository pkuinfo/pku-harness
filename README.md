# pku-harness

An open-source, AI-native app for campus life at Peking University. Sign in once with your
campus account; an AI agent (bring your own model) and a set of plugins handle the rest:
card balance, network fee, timetable, courses, reminders and more.

- Four tabs: **Chat** (agent + generative UI), **Dashboard** (AI-built widgets),
  **Schedule** (timetable, to-dos, reminders), **Settings**.
- Everything is a plugin; everything the user can do, the agent can do.
- Built with Expo + React Native. Android first.

Docs: [Architecture](docs/ARCHITECTURE.md) · [Design](docs/DESIGN.md) · [Plan](docs/PLAN.md) ·
[Contributor guidelines](AGENTS.md)

## Develop

```bash
bun install
bun run android   # build and run on an Android emulator/device
```

Requires JDK 17 and the Android SDK. See AGENTS.md for details.

## License

MIT
