# pku-harness: guidelines for agents and contributors

An AI-native, plugin-based campus-life app for PKU students. Expo SDK 58 + React Native 0.88,
Android first. Read these before changing code:

- `docs/ARCHITECTURE.md`: layers, plugin model, agent, generative UI, scheduler, campus access
- `docs/DESIGN.md`: tokens, components, motion rules, review checklist
- `docs/PLAN.md`: milestones and task status (update it when a task lands)

## Principles

1. **Everything is a plugin** (from DeepSeek Harness, `../deepseek-harness/docs/architecture.md`).
   New capability = a plugin or a contribution to one, not feature code in a screen.
2. **Human and AI are equal operators.** Every capability is one typed tool. Screens call it on
   tap; the agent calls it as a tool. If the user can do it, the agent can, and vice versa.
3. **Simple surface, agent does the work.** Prefer one smart action over a settings screen.
4. **UI/UX is the product.** Native, fast, creative motion. Follow `docs/DESIGN.md`.
5. **Campus protocols come from pkucli.** Port behaviour from `../pkucli/crates/*` and cite the
   source file in a comment. Don't guess endpoints.
6. **Credentials stay on the device** (SecureStore). Never log them, never send them to a
   server we run, never hand them to a remote plugin.

## Expo has changed: do not trust your training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo, EAS
or React Native API:

1. Read the `expo` major version in `package.json` (currently 58).
2. Read the versioned docs: `https://docs.expo.dev/versions/v58.0.0/` (append `.md` for markdown).
3. For anything else, start from https://docs.expo.dev/llms.txt.
4. Load the matching skill in `../.claude/skills/` (`expo-overview` routes to the others).

## Commands (always bun / bunx, never npm/npx/yarn/pnpm)

```bash
bunx expo install <pkg>      # add packages (SDK-compatible versions)
bun run check                # typecheck + lint, run before declaring any task done
bun test                     # unit tests (pure TS: recurrence, plugin runtime, parsers)
bun run android              # dev build + install on the emulator (needs JAVA_HOME=JDK 17)
bunx expo start              # Metro only (dev client already installed)
bunx expo-doctor             # dependency/config diagnosis
```

Android environment: `JAVA_HOME=~/.local/share/jdks/jdk17`, `ANDROID_HOME=~/Android/Sdk`,
emulator AVD `Medium_Phone_API_37.0` (`emulator-5554`).

## Code rules

- Routes only in `src/app/`; screen bodies in `src/screens/`; tokens in `src/theme/`;
  primitives in `src/components/`; runtime in `src/core/`; plugins in `src/plugins/<id>/`.
- No hex colours, font sizes or spacing literals outside `src/theme/`.
- Text only through `@/components/text`. Native controls from `@expo/ui` first.
- Validate all agent/tool/plugin I/O with zod. Tool ids are `<plugin>.<tool>`.
- `android/` and `ios/` are generated (CNG): configure through `app.json` and config plugins,
  never edit by hand. Custom native code lives in `modules/`.
- Kebab-case file names; one named export per component file; colocate tests (`*.test.ts`).
- Commits: conventional style (`feat(chat): …`), small and focused.

## Verifying UI

Build, run on the emulator, and look at it (mobile-mcp: screenshot + element list) before
saying a UI task is done. Check dark and light themes and the DESIGN.md review checklist.
