# pku-harness Design System

> Updated 2026-11-08. The user's requested direction is a restrained, Codex-inspired utility UI
> across the full app. This supersedes the earlier Glass + Light / trading-terminal direction.
> Tokens live in `src/theme/` and `src/global.css`; plugins consume host components through the SDK.

## 1. Direction: a quiet workspace

The screen should make the task easy to scan. Use a neutral opaque canvas, compact typography,
flat settings and work logs, and small explicit controls. Do not imply a pixel-exact reproduction
of Codex: the desktop window was not available to inspect through this session's app controls.
Android keeps native switches, pickers, accessible touch targets, and mobile navigation.

- **Neutral first:** charcoal in dark mode, warm off-white in light. No decorative gradients,
  background animation, frosted cards, gleams, or glowing status text in everyday task screens.
- **Dark depth:** use stepped charcoal fills, soft card/control shadows, 20 px panel corners,
  and 16 px button/input corners. Contained list sections may use rounded dark surfaces;
  retain compact rows and avoid stacking shadows inside cards. Light styling remains flatter.
- **Compact hierarchy:** fixed compact toolbars; section titles use bodyStrong/headline. Reserve
  large numbers for actual financial or quantitative content, not setup status or page decoration.
- **Flat lists:** use rows and subtle separators for settings, app/plugin selection, tool work,
  and session lists. Cards are appropriate for independent dashboard widgets and charts; avoid
  wrapping every section in one. Nested cards need a concrete interaction reason.
- **Controlled accent:** retain PKU identity and semantic signal colors. Red denotes primary
  actions or selected states where needed, not every icon, row, border, or surface. Navigation
  uses neutral selection. Errors retain their own semantic role.
- **Progressive detail:** connection configuration, metadata, and tool details open on demand.
  Never remove required consent, permission explanations, errors, or recovery actions for density.
- **Accessible controls:** icon-only actions need labels/tooltips. Keep readable text scaling and
  native touch targets; do not shrink switches just to make screenshots look compact.
- **Purposeful motion:** brief press/selection feedback only. No idle background animation or
  decorative bouncing. Respect reduced motion; task progress must remain explicit in text/state.

## 1b. Shared defaults and compatibility

`Screen` defaults to the plain canvas and compact fixed toolbar. The older standard header is
still an explicit option. `ListGroup` defaults to flat light rows and rounded dark sections; `ListRow` keeps compact spacing.
`Glass` remains an SDK-compatible name for an opaque subtle panel, without native glass or sheen.
`Aurora` remains a compatibility export that paints only a static theme canvas; its wake hooks
no longer run an idle animation. Native controls still use the host theme.

The P/orbit logo is retained as the product mark. It is not repeated as decorative page art.
Onboarding is the one place with hero art: the intro's first page shows the 3D brand hero (2D
fallback when GL is unavailable or errors), the other intro pages their illustrations, and the
finish screen the celebrating hero. Setup steps use a compact icon.

## 2. Tokens

Styling is atomic: Uniwind (Tailwind v4) classNames, with the tokens below defined as Tailwind
theme values and light/dark CSS variables in `src/global.css`. The TS tokens in `src/theme`
stay for Reanimated, Skia and native props that can't take a className.


| Class | File | Notes |
|---|---|---|
| Colours | `src/theme/colors.ts` | `palette` (raw) → `light`/`dark` semantic maps. Hook `useTheme()` returns the active map. |
| Spacing | `src/theme/spacing.ts` | 4-pt grid: `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48`. Screen padding = `lg`. |
| Typography | `src/theme/typography.ts` | Named styles: `display`, `title`, `headline`, `body`, `callout`, `caption`, `micro`, plus `number` variants with tabular figures. |
| Radius | `src/theme/radius.ts` | Concentric: `sm 6` chips · `md 10` controls · `lg 16` cards · `xl 20` hero/sheets · `full` dots only. Always with `borderCurve: 'continuous'`. |
| Elevation | `src/theme/shadows.ts` | Dark surfaces combine tonal separation with `darkCard` and `darkControl` shadows. Reserve stronger `float` / `overlay` shadows for floating elements. Use `boxShadow` strings. |
| Motion | `src/theme/motion.ts` | Durations `fast 140 · base 240 · slow 420`; critically damped springs `snappy`, `smooth`; stagger `40ms`. |

### Semantic colour roles (dark)

| Role | Use |
|---|---|
| `bg` | App canvas (near black) |
| `surface` / `surface2` / `surface3` | Layered panels, raised rows, pressed states |
| `border` | Hairlines between groups |
| `text` / `textMuted` / `textFaint` | Primary, secondary, tertiary labels |
| `accent` / `accentMuted` / `onAccent` | PKU red action colour, its tinted fill, text on it |
| `up` / `down` / `warn` / `info` | Signals |
| `glow` | Accent-derived colour for hero effects only |

Static values only go into Reanimated styles (no `PlatformColor` there).

## 3. Typography

- UI font: **Inter** (bundled via `@expo-google-fonts/inter`, weights 400/500/600/700) for a
  crisp terminal feel on Android, where the system font varies by vendor.
- Numbers: Inter with `fontVariant: ['tabular-nums']`; large balances use `display` (40/700,
  tight tracking).
- Chinese text falls back to the system CJK font; keep line height ≥ 1.35× for CJK.
- Respect Dynamic Type / font scale. Never disable scaling.

## 4. Components (`src/components/`)

Contract for every primitive: `variant`, `size`, states (default, pressed, disabled,
loading), `style` merged last, accessibility role/state/label.

| Component | Notes |
|---|---|
| `Text` | Only way to render text. `variant` maps to typography tokens; `tone` maps to text colours. |
| `Button` | `primary` (accent), `secondary` (surface), `ghost`, `danger`; sizes `sm/md/lg`; press = scale 0.97 spring + haptic. |
| `IconButton` | Icon-only; requires `label`. |
| `Surface` | Opaque panel (`level` 1–3 fills; level 1 adds a hairline edge). Use only where grouping helps. |
| `Glass` | Compatibility panel name; opaque regular / strong / brand surfaces with press feedback. |
| `Aurora` | Static neutral canvas; no idle animation. |
| `ListGroup` / `ListRow` | Grouped rows with hairlines (settings, plugin lists). Prefer `@expo/ui` list rows where they fit. |
| `Stat` | Label + big animated number + delta chip. Building block of dashboard widgets. |
| `AnimatedNumber` | Rolling-digit number transition (Reanimated). |
| `Chip` / `Badge` | Filters, statuses, effects (read/write/money). |
| `Sheet` | Use `@expo/ui` BottomSheet; wrapper only adds theme. |
| `Field` (text, secure, number) | Inputs with label, hint, error; focus ring in accent. |
| `EmptyState` / `Skeleton` | Every data view has loading, empty, error, content states. Skeletons shimmer; no full-screen spinners. |
| `Logo` | The brand mark (Skia); `orbiting` while the agent works, `intro` draws it on. |
| `TabBar` | Custom bottom bar over Expo Router tabs: opaque neutral surface, restrained selection, haptics. |

Native-first rule: pickers, switches, sliders, menus, date/time pickers and bottom sheets
come from `@expo/ui` (Jetpack Compose on Android, SwiftUI on iOS). Only wrap them for theme.

## 5. Motion rules

Use short native/host press feedback and restrained selection transitions. Do not animate idle
surfaces or bounce navigation icons. Preserve reduced-motion support. Enter/exit animations must
not delay input, hide errors, or leave transparent interactive layers over content.

The standard for every screen, sheet and plugin:

- **No bounce.** Springs come only from `springs` in `src/theme/motion.ts`, which are critically
  damped: they settle without overshoot. Never a bare `.springify()` or `withSpring(x)` without a
  preset; timing animations use the `curves`.
- **Nothing appears or moves in one frame.** Things that enter fade or slide in; things that
  change size or position animate (`LinearTransition` with a preset). A visible jump is a bug.
- **One motion at a time, tied to its cause.** Whatever moves with the keyboard follows the
  keyboard's own animation frame by frame (`react-native-keyboard-controller`: the composer uses
  `useReanimatedKeyboardAnimation`, lists use `KeyboardChatScrollView`/`KeyboardAwareScrollView`).
  Don't add a second scroll or jump on top of a keyboard-driven move.
- **Chat:** tapping the input raises the keyboard, the composer and the end of the conversation
  together; sending closes the keyboard and the conversation glides down to the new message
  (animated scroll); while a reply streams and the reader is at the end, the view follows it;
  a reader who scrolled up is never moved.

## 6. Generative-UI styling

The json-render catalog renders through these same components, so anything the agent builds
looks native to the app. The agent chooses structure (which components, what data); it never
chooses raw colours or sizes. Catalog props expose semantic options only (`tone: 'up'`,
`size: 'lg'`).

## 7. Review checklist (run after every screen)

1. Screenshot on the emulator in dark and light.
2. Hierarchy: the one number or action that matters is obviously first.
3. No hex, font size or spacing literal outside `src/theme/` (grep).
4. Four data states present (loading, empty, error, content).
5. Every tappable thing has pressed feedback and an accessibility label.
6. Check against "native slop" tells (`expo-design-system/references/native-slop.md`).



## 8. Verification coverage

Every design change needs on-device light/dark captures. A full-app pass must cover Chat (empty,
conversation, composer, model/session sheets), Dashboard (widgets/editing), Schedule (list/form),
Settings (main, AI, campus, notifications/cloud), Plugins (list/market/detail), Usage, onboarding,
and representative SDK-rendered plugin screens. Check keyboard, scrolling, 130% text scaling,
empty/error/loading states, and core actions without clearing the user's data. Record actual
coverage and limitations in PLAN.md; passing unit tests alone is not visual verification.

Copilot retains its floating icon controls, safe approvals, app icons, and alphabet quick access.
Phone-control behavior and app scope must not change as a side effect of this redesign.
