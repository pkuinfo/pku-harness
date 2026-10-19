# pku-harness Design System

> v0, 2026-10-18. Visual source of truth. Tokens live in `src/theme/`; primitives in
> `src/components/`. Skills to load when designing: `expo-design-system`, `expo-native-ui`,
> `expo-ui`, `expo-animation`, `apple-design`, `motion-design`, `impeccable`.

## 1. Direction: "Campus terminal"

The feel of a premium trading app (OKX, Binance): dark, dense with live numbers, precise
type, confident motion, applied to campus life. Simple surfaces, one accent, numbers as the
heroes. It should feel like an instrument, not a brochure.

- **Dark-first.** Near-black canvas with layered graphite surfaces. Light theme exists and
  follows the same structure, but dark is the reference design.
- **One brand accent: PKU red,** tuned for screens. Used for primary actions, the active tab
  and the agent's presence. Never for errors (errors use their own hue).
- **Numbers are heroes.** Balances, fees and countdowns use tabular figures, large sizes and
  animated transitions (rolling digits) when they change.
- **Signal colours** borrowed from trading UIs: up/positive = green, down/alert = red-orange,
  neutral = graphite. Always paired with an icon or sign, never colour alone.
- **Motion is the personality.** Springs, not linear tweens. Everything enters, nothing
  pops. Lists stagger. While the agent works, the bead orbits the logo.
- **Restraint where it counts.** No card-for-everything, no emoji icons, nothing decorative
  behind dense data. Glass stays nearly transparent; light is the only decoration.

## 1b. Brand system (2026-10-18)

- **Mark**: a "P" whose bowl is an open orbit with the agent as a bright bead travelling on it
  (PKU + harness + agent). Geometry lives once in `src/theme/brand.ts`; `<Logo>` (Skia) draws
  it in-app and can perform (draw-on intro, orbiting bead); `bun scripts/render-icons.ts`
  renders the app icon, adaptive icon (fg/bg/monochrome), splash and favicon from the same
  geometry. Never redraw the mark by hand.
- **Glass + Light** (2026-10-18, the design language): panels are nearly transparent glass
  over a dim, slowly drifting light. Restraint first: no milky fills, no outlines, no glare.
  - **Colour** comes from PKU's official identity (`pkuBrand`, from 《北京大学视觉形象识别系统》
    A7/A9): 北大红 #8B0012 for brand fills (`theme.brand`: primary buttons, selection, the
    user's bubble tint), the auxiliary bronze / sand / slate / navy only as light in the
    aurora or accents. `theme.accent` is the legible red for text and icons.
  - **Aurora** (`<Aurora>`): three dim radial lights (Skia), Lissajous drift over 36 s on the UI
    thread; paused when its screen is not focused, still with reduced motion. The tabs layout
    paints one for all tabs (`BackdropProvided`); standalone screens and sheets paint their own.
  - **Glass** (`<Glass>`, `GlassEdges`, `glassMaterial`): iOS 26 → system `GlassView`
    (expo-glass-effect is iOS-only); elsewhere a fill of 2.5–5 % white (dark) / 22–50 % white
    (light), one hairline edge, and a 1 px light line along the top edge. Semantic
    `surface*` tokens are these fills, so every card is glass; overlays use `elevated`.
  - **Corners are concentric**: outer panels follow the phone's corner (cards 16, hero panels
    and sheets 20); controls inside get small radii (buttons/inputs 10, chips 6). Capsules only
    for dots, progress bars and avatars.
- **Motion** for UX, all on the UI thread: screens settle in on every focus
  (`useFocusEnter`), large titles hand over to a compact glass bar on scroll, the tab
  indicator slides and stretches between tabs and the selected icon pops, sent messages grow
  out of the composer's corner, assistant parts rise in, panels lift and settle on press.
- **Motion curves** (`curves` in `src/theme/motion.ts`): strong ease-out for entering and
  responding, ease-in-out for on-screen movement, the iOS sheet curve for sheets. Never
  ease-in on UI. Off-screen art is unmounted; long-running loops only on the visible page.

## 2. Tokens

| Class | File | Notes |
|---|---|---|
| Colours | `src/theme/colors.ts` | `palette` (raw) → `light`/`dark` semantic maps. Hook `useTheme()` returns the active map. |
| Spacing | `src/theme/spacing.ts` | 4-pt grid: `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48`. Screen padding = `lg`. |
| Typography | `src/theme/typography.ts` | Named styles: `display`, `title`, `headline`, `body`, `callout`, `caption`, `micro`, plus `number` variants with tabular figures. |
| Radius | `src/theme/radius.ts` | Concentric: `sm 6` chips · `md 10` controls · `lg 16` cards · `xl 20` hero/sheets · `full` dots only. Always with `borderCurve: 'continuous'`. |
| Elevation | `src/theme/shadows.ts` | Dark UIs separate layers by surface tone, not shadow. Shadows only for floating elements (`float`, `overlay`). Use `boxShadow` strings. |
| Motion | `src/theme/motion.ts` | Durations `fast 140 · base 240 · slow 420`; springs `snappy`, `smooth`, `bouncy`; stagger `40ms`. |

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
| `Surface` | Glass panel (`level` 1–3 fills; level 1 adds edge + top light). Not every group needs one. |
| `Glass` | The panel material, pressable with lift + spring; `tone` regular / strong / brand. |
| `Aurora` | The drifting-light backdrop. |
| `ListGroup` / `ListRow` | Grouped rows with hairlines (settings, plugin lists). Prefer `@expo/ui` list rows where they fit. |
| `Stat` | Label + big animated number + delta chip. Building block of dashboard widgets. |
| `AnimatedNumber` | Rolling-digit number transition (Reanimated). |
| `Chip` / `Badge` | Filters, statuses, effects (read/write/money). |
| `Sheet` | Use `@expo/ui` BottomSheet; wrapper only adds theme. |
| `Field` (text, secure, number) | Inputs with label, hint, error; focus ring in accent. |
| `EmptyState` / `Skeleton` | Every data view has loading, empty, error, content states. Skeletons shimmer; no full-screen spinners. |
| `Logo` | The brand mark (Skia); `orbiting` while the agent works, `intro` draws it on. |
| `TabBar` | Custom bottom bar over Expo Router tabs: blurred surface, animated active pill, haptics. |

Native-first rule: pickers, switches, sliders, menus, date/time pickers and bottom sheets
come from `@expo/ui` (Jetpack Compose on Android, SwiftUI on iOS). Only wrap them for theme.

## 5. Motion rules

- Use Reanimated 4 on the UI thread for everything interactive; CSS-style
  `transition`/`animation` props for simple state changes.
- Press feedback within 1 frame: scale 0.97 + opacity, spring back (`snappy`).
- Enter: fade + 8–16 px rise with `smooth` spring; lists stagger 40 ms, capped at 8 items.
- Numbers: roll digits on change; colour flash `up`/`down` for 600 ms.
- Tab switch: content cross-fade + active pill slides with `smooth`.
- Respect reduced motion (`useReducedMotion`): replace movement with fades.
- Haptics: light impact on primary press and toggles, success notification on completed
  agent actions, warning on failures.

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
