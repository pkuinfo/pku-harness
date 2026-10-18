/**
 * Brand mark geometry and colours (viewBox 0 0 120 120), shared by the in-app <Logo> and
 * `scripts/render-icons.ts` (app icon, adaptive icon, splash). The mark: a "P" whose bowl is an
 * open orbit, with the agent as a bright dot travelling on it.
 */
export const brand = {
  tile: { radius: 28, stops: ['#FF5A63', '#E0182F', '#7A0610'] as const },
  highlight: { cx: 26, cy: 14, r: 78, color: '#FFFFFF', opacity: 0.24 },
  stem: { x: 33, y: 23.5, width: 15, height: 72, rx: 4.5 },
  orbit: { cx: 62, cy: 53, r: 23, stroke: 13, startDeg: -156, endDeg: 156 },
  agent: { deg: -38, r: 8.5 },
  ink: ['#FFFFFF', '#FFE1E4'] as const,
  /** Spark colour for the agent dot's glow. */
  glow: '#FFD8DC',
};

const rad = (d: number) => (d * Math.PI) / 180;

/** Point on the orbit at an angle (degrees, 0 = +x, clockwise in screen space). */
export function orbitPoint(deg: number) {
  const { cx, cy, r } = brand.orbit;
  return { x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) };
}

/** SVG path for the open orbit (large clockwise arc leaving a gap where it meets the stem). */
export function orbitPath() {
  const a = orbitPoint(brand.orbit.startDeg);
  const b = orbitPoint(brand.orbit.endDeg);
  const { r } = brand.orbit;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 1 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** Full logo as an SVG string (for icon rendering). `tile: false` = mark only. */
export function logoSvg({ tile = true, mono = false, size = 1024, inset = 0 }: { tile?: boolean; mono?: boolean; size?: number; inset?: number } = {}) {
  const s = brand.stem;
  const o = brand.orbit;
  const dot = orbitPoint(brand.agent.deg);
  const ink = mono ? '#FFFFFF' : 'url(#ink)';
  const scale = (120 - inset * 2) / 120;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${brand.tile.stops[0]}"/><stop offset="0.5" stop-color="${brand.tile.stops[1]}"/><stop offset="1" stop-color="${brand.tile.stops[2]}"/>
    </linearGradient>
    <radialGradient id="hl" cx="${brand.highlight.cx}" cy="${brand.highlight.cy}" r="${brand.highlight.r}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="${brand.highlight.opacity}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${brand.ink[0]}"/><stop offset="1" stop-color="${brand.ink[1]}"/></linearGradient>
    <mask id="gap" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
      <rect width="120" height="120" fill="#fff"/><circle cx="${dot.x.toFixed(2)}" cy="${dot.y.toFixed(2)}" r="${brand.agent.r + 2.2}" fill="#000"/>
    </mask>
    <radialGradient id="spark"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="${brand.glow}" stop-opacity="0"/></radialGradient>
  </defs>
  ${tile ? `<rect width="120" height="120" rx="${brand.tile.radius}" fill="url(#tile)"/><rect width="120" height="120" rx="${brand.tile.radius}" fill="url(#hl)"/>` : ''}
  <g transform="translate(${inset} ${inset}) scale(${scale})">
    <g mask="url(#gap)">
      <rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.rx}" fill="${ink}"/>
      <path d="${orbitPath()}" fill="none" stroke="${ink}" stroke-width="${o.stroke}" stroke-linecap="butt"/>
    </g>
    ${mono ? '' : `<circle cx="${dot.x.toFixed(2)}" cy="${dot.y.toFixed(2)}" r="${brand.agent.r * 2.6}" fill="url(#spark)"/>`}
    <circle cx="${dot.x.toFixed(2)}" cy="${dot.y.toFixed(2)}" r="${brand.agent.r}" fill="#FFFFFF"/>
  </g>
</svg>`;
}
