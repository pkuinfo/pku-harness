/**
 * Dark UIs combine stepped charcoal fills with soft shadows on contained surfaces.
 * `boxShadow` strings (New Architecture).
 */
export const shadows = {
  darkCard: '0 4px 14px rgba(0, 0, 0, 0.24)',
  darkControl: '0 2px 4px rgba(0, 0, 0, 0.18)',
  float: '0 6px 20px rgba(0, 0, 0, 0.35)',
  /** Light-theme lift for small raised controls (segmented thumb). */
  raised: '0 1px 3px rgba(11, 13, 16, 0.12)',
  overlay: '0 12px 40px rgba(0, 0, 0, 0.5)',
} as const;
