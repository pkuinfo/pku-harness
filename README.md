# PKU Harness

An open-source, AI-native app for campus life at Peking University. The app is a **harness**:
an agent loop, a design system and host services. All content comes from **plugins**, and
every plugin is equal, whether it ships in the app or comes from the community.

- **Chat**: the agent streams answers, calls plugin tools, and renders native UI (forms,
  pickers, cards) inline. Risky actions ask first, per plugin and per effect.
- **Dashboard**: widgets the agent builds and keeps live (data bindings to plugin tools).
- **Schedule**: timetable, to-dos and reminders with free-form recurrence ("every 3 days, 16
  times"), delivered as exact local notifications, plus scheduled data checks.
- **Settings**: AI provider (DeepSeek by default, any OpenAI-compatible endpoint), plugins and
  permissions, marketplace, memory, notifications, appearance, data.

Credentials and data stay on the phone. Bring your own model key; no server of ours sees it.

| Repo | |
|---|---|
| this repo | The harness (Expo SDK 58 / React Native 0.88, Android first) |
| [`pkuinfo/pku-harness-plugins`](https://github.com/pkuinfo/pku-harness-plugins) (submodule `./plugins`) | SDK, all plugins, marketplace registry — start here to contribute a plugin |
| [`pkuinfo/pkucli`](https://github.com/pkuinfo/pkucli) | Reference implementations of PKU service protocols |

Docs: [Architecture](docs/ARCHITECTURE.md) · [Design](docs/DESIGN.md) · [Plan](docs/PLAN.md) ·
[Ecosystem](docs/ECOSYSTEM.md) · [Contributor guidelines](AGENTS.md)

## Develop

```bash
git clone --recurse-submodules https://github.com/pkuinfo/pku-harness.git
cd pku-harness
bun install
bun run check          # typecheck + lint (app and plugins)
bun test               # unit tests (scheduler, timetable, memory, MCP client…)
bun run android        # dev build on an emulator/device (JDK 17 + Android SDK)
bunx expo start --dev-client
```

Plugins live in the `plugins/` submodule: change them there, push to
`pku-harness-plugins`, then commit the submodule bump here.

### Testing without campus access or a model key

- Dev-only deep links run tools and chat turns on a device:
  `pkuharness://dev?tool=scheduler.preview&input=<json>` and `pkuharness://dev?chat=<text>`
  (`&actor=agent` exercises the ask-first prompts).
- Point **AI 服务 → OpenAI 兼容** at any OpenAI-compatible server (a local mock works) to
  exercise the agent loop end to end.
- `plugins/examples/demo-canteen` is a runnable remote (MCP) plugin.

## License

MIT
