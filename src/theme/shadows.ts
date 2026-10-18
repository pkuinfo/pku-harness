/**
 * Dark UIs separate layers by surface tone; shadows are only for floating elements.
 * `boxShadow` strings (New Architecture).
 */
export const shadows = {
  float: '0 6px 20px rgba(0, 0, 0, 0.35)',
  /** Light-theme lift for small raised controls (segmented thumb). */
  raised: '0 1px 3px rgba(11, 13, 16, 0.12)',
  overlay: '0 12px 40px rgba(0, 0, 0, 0.5)',
} as const;
