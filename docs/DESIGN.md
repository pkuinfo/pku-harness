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
  pops. Lists stagger. The agent "breathes" (a soft animated orb) while thinking.
- **Restraint.** No decorative gradients behind content, no card-for-everything, no emoji
  icons. Effects (glow, shader backgrounds, particles) are reserved for 2–3 hero moments:
  the agent orb, the login screen, and the payment-code screen.

## 2. Tokens

| Class | File | Notes |
|---|---|---|
| Colours | `src/theme/colors.ts` | `palette` (raw) → `light`/`dark` semantic maps. Hook `useTheme()` returns the active map. |
| Spacing | `src/theme/spacing.ts` | 4-pt grid: `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48`. Screen padding = `lg`. |
| Typography | `src/theme/typography.ts` | Named styles: `display`, `title`, `headline`, `body`, `callout`, `caption`, `micro`, plus `number` variants with tabular figures. |
| Radius | `src/theme/radius.ts` | `sm 8 · md 12 · lg 16 · xl 24 · full`. Always with `borderCurve: 'continuous'`. |
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
| `Surface` | Layer container (`level` 1–3), token padding + radius. Not every group needs one. |
| `ListGroup` / `ListRow` | Grouped rows with hairlines (settings, plugin lists). Prefer `@expo/ui` list rows where they fit. |
| `Stat` | Label + big animated number + delta chip. Building block of dashboard widgets. |
| `AnimatedNumber` | Rolling-digit number transition (Reanimated). |
| `Chip` / `Badge` | Filters, statuses, effects (read/write/money). |
| `Sheet` | Use `@expo/ui` BottomSheet; wrapper only adds theme. |
| `Field` (text, secure, number) | Inputs with label, hint, error; focus ring in accent. |
| `EmptyState` / `Skeleton` | Every data view has loading, empty, error, content states. Skeletons shimmer; no full-screen spinners. |
| `AgentOrb` | Animated presence indicator for the agent (idle / thinking / speaking). Hero effect #1. |
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
