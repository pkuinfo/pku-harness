/** Approved little-swallow identity. Canonical geometry shared by every exported asset.
 * Canvas: 120 × 120. See docs/BRAND.md. Never redraw the mark in consuming code.
 */
export const brand = {
  name: 'PKU harness',
  primary: '#8B0012',
  ivory: '#F7F4EE',
  charcoal: '#202124',
  white: '#FFFFFF',
  tile: { radius: 28, stops: ['#C42236', '#8B0012', '#52000A'] as const },
  // Existing scene palette and activity-indicator geometry, not the brand silhouette.
  orbit: { cx: 62, cy: 53, r: 23, stroke: 13, startDeg: -156, endDeg: 156 },
  agent: { deg: -38, r: 8.5 },
  ink: ['#FFFFFF', '#FFE1E4'] as const,
  glow: '#FFD8DC',
  motion: { introMs: 420, pulseMs: 900, activeOpacity: 0.72 },
  path: 'M 47.40 39.60 C 44.80 33.40 41.80 26.00 43.80 23.80 C 46.40 20.60 54.20 26.20 58.40 30.40 C 62.40 34.20 65.00 37.20 67.00 38.60 L 63.00 44.60 C 64.80 39.80 70.40 36.00 76.20 35.80 C 84.60 35.80 90.40 39.80 94.00 45.60 L 99.20 46.40 Q 102.20 47.00 99.80 49.00 L 95.00 52.20 C 94.80 66.20 87.40 77.40 76.60 84.20 C 66.00 90.80 55.40 91.80 45.00 88.20 L 24.60 97.00 Q 21.80 98.20 23.80 95.00 L 31.80 85.00 C 26.00 83.40 20.80 81.20 18.40 79.20 Q 17.00 77.40 20.40 77.40 C 32.60 77.60 41.40 75.20 47.60 70.80 C 34.80 68.00 24.40 58.20 21.60 43.20 C 20.20 37.80 21.80 35.40 26.00 37.00 C 34.40 39.40 42.80 41.20 51.00 45.00 C 58.60 48.40 66.20 53.60 67.80 60.20 C 68.60 65.80 66.20 70.80 62.60 75.00 C 68.80 71.20 72.60 65.60 72.40 60.40 C 71.80 51.00 60.00 44.00 47.40 39.60 Z M 81.4 48.6 A 3.0 3.0 0 1 0 87.4 48.6 A 3.0 3.0 0 1 0 81.4 48.6 Z',
};

/** Full tile or transparent mark. Eye/wing remain transparent in all colourways. */
export function logoSvg({ tile = true, mono = false, size = 1024, inset = 0, color }: { tile?: boolean; mono?: boolean; size?: number; inset?: number; color?: string } = {}) {
  const scale = (120 - inset * 2) / 120;
  const ink = color ?? (tile || mono ? brand.white : brand.primary);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120"><title>PKU harness</title>
  ${tile ? `<rect width="120" height="120" rx="${brand.tile.radius}" fill="${brand.primary}"/>` : ''}
  <g transform="translate(${inset} ${inset}) scale(${scale})"><path d="${brand.path}" fill="${ink}" fill-rule="evenodd"/></g>
</svg>`;
}
