## What and why

<!-- One or two sentences on the change and the reason. Link the issue: Closes #… -->

## How it was tested

<!-- Commands you ran, and what you checked on an emulator or device. -->

## Screenshots

<!-- For UI changes: emulator or device screenshots in light and dark themes. Redact any personal data. -->

## Checklist

- [ ] `bun run verify` passes (typecheck + lint + tests, exactly what CI runs)
- [ ] UI changes were checked on an emulator or device in light and dark themes against the [DESIGN.md](../docs/DESIGN.md) checklist, with screenshots above
- [ ] No real credentials, student IDs or personal data are committed
- [ ] Plugin changes were committed to the plugins repository first; this PR only bumps the submodule
- [ ] Docs are updated where behaviour changed (README, docs/, PLAN.md, website docs)
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat(chat): …`)
