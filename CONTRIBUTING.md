# Contributing to PKU Harness

Thanks for helping. This repository is the **harness**: the app shell, the agent loop, the design
system and the host services. Connecting a new campus service almost always belongs in the
[plugins repository](https://github.com/pkuinfo/pku-harness-plugins) (the `plugins/` submodule
here), usually as a `PLUGIN.md` document rather than code.

## Before you start

- [AGENTS.md](AGENTS.md): code conventions, shared by people and AI coding agents.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, plugin model, agent, storage.
- [docs/AGENT-HARNESS.md](docs/AGENT-HARNESS.md): sessions, commands, composer, context, usage.
- [docs/DESIGN.md](docs/DESIGN.md): design rules and the UI review checklist (required for UI
  changes).
- [docs/PLAN.md](docs/PLAN.md): roadmap and task status.

## Development setup

```bash
git clone --recurse-submodules https://github.com/pkuinfo/pku-harness.git
cd pku-harness
bun install            # always bun / bunx; never npm, npx, yarn or pnpm
bun run verify         # typecheck + lint + tests: exactly what CI runs
bun run android        # development build on an emulator or device (JDK 17 + Android SDK)
```

- **Expo SDK 58 changes often.** Read the versioned docs at
  <https://docs.expo.dev/versions/v58.0.0/> before touching an Expo or React Native API; don't
  rely on memory.
- **System proxies.** If you run Clash or a similar proxy, start the Android emulator without
  inheriting `HTTP_PROXY`; campus services must be reached directly.
- **No campus network or model key?** See "Without campus network or a model key" in the
  [README](README.md#without-campus-network-or-a-model-key).
- **Keep the machine responsive.** The emulator alone needs about 5 GB of RAM. Run one heavy step
  at a time (Gradle build, emulator, full test run) and stop the Gradle daemon after builds
  (`./gradlew --stop`).

## Workflow

1. Open an issue describing what you want to change. Small fixes can go straight to a pull
   request.
2. Branch from `master` and make small, focused commits with
   [Conventional Commits](https://www.conventionalcommits.org) messages: `feat(chat): …`,
   `fix(campus): …`, `docs: …`.
3. For plugin changes, commit and push in the `plugins/` submodule first, then commit the
   submodule bump here. A bump that changes SDK or cloud-protocol types needs this repository's
   `bun run verify` too.
4. Before opening a pull request, make sure `bun run verify` passes. For UI changes, check the
   screen on a device in **both light and dark themes** and attach screenshots.
5. Update the matching task in [docs/PLAN.md](docs/PLAN.md).

## Code and structure

- Routes live only in `src/app/`, screen bodies in `src/screens/`, primitives in
  `src/components/`, runtime and host services in `src/core/`, design tokens in `src/theme/`.
- Kebab-case file names, one main export per file, tests next to the code (`*.test.ts`).
- Style with Uniwind class names first; colours, font sizes and spacing come only from theme
  tokens, never literals.
- Write pure logic (parsers, recurrence, compaction, aggregation) as pure functions with unit
  tests.
- `android/` and `ios/` are generated (Continuous Native Generation): configure them through
  `app.json` and config plugins, never by hand. Custom native code lives in `modules/`.
- Campus protocols come from [pkucli](https://github.com/pkuinfo/pkucli); cite the source file in
  a comment.
- Documentation and contributor-facing text are in English. App strings are localised (Simplified
  Chinese first, then English) through `src/i18n`.

## Security and privacy (non-negotiable)

- Campus accounts, passwords, authenticator secrets and AI keys live only in the phone's
  SecureStore. Never log them, upload them, or hand them to a remote plugin or a model.
- Commits must never contain real credentials, student IDs, personal data, or screenshots that
  show them. Use synthetic fixtures.
- Report security issues privately as described in [SECURITY.md](SECURITY.md).

## Code of Conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
