/**
 * Concentric corners: outer panels follow the phone's own corner (a 16 px margin in from a ~36 px
 * screen corner → 20); what sits inside a panel gets a small radius. Capsules (`full`) only for
 * dots, progress bars and avatars, never for buttons or chips.
 * Pair every non-capsule radius with `borderCurve: 'continuous'`.
 */
export const radius = {
  /** Chips, tags, tiny controls. */
  sm: 6,
  /** Buttons, inputs, segmented controls, icon wells. */
  md: 10,
  /** Cards and grouped lists. */
  lg: 16,
  /** Hero panels, sheets. */
  xl: 20,
  full: 9999,
} as const;
