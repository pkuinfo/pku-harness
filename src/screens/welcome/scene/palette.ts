import { brand, pkuBrand, themes, type ThemeName } from '@/theme';

/**
 * Colours of the welcome hero and its illustrations, all derived from the brand tokens
 * (src/theme/brand.ts tile stops + glow, the PKU auxiliary amber, the theme surfaces): no new
 * hex values. The shaders take them as uniforms; the SVG art takes them as fills.
 */

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function rgbToHex([r, g, b]: RGB) {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const [BRIGHT, CORE, DEEP] = brand.tile.stops.map(hexToRgb) as [RGB, RGB, RGB];
const GLOW = hexToRgb(brand.glow);
const WHITE = hexToRgb(brand.ink[0]);
const AMBER = hexToRgb(pkuBrand.amber);

/** Shader palette per theme (sRGB 0–1). */
export type HeroPalette = {
  /** Shadowed body of the glass (darkest red). */
  deep: RGB;
  /** 北大红: the body colour. */
  core: RGB;
  /** Lit red. */
  bright: RGB;
  /** The agent's hot inner light and lit edges. */
  glow: RGB;
  /** A touch of warmth for flares (PKU amber). */
  warm: RGB;
  /** Orbit lines and service points. */
  ink: RGB;
  /** The page: what the glass reflects at grazing angles. */
  paper: RGB;
};

export const heroPalettes: Record<ThemeName, HeroPalette> = {
  dark: {
    deep: mixRgb(DEEP, hexToRgb(themes.dark.bg), 0.45),
    core: CORE,
    bright: BRIGHT,
    glow: GLOW,
    warm: AMBER,
    ink: GLOW,
    paper: hexToRgb(themes.dark.bg),
  },
  light: {
    deep: DEEP,
    core: CORE,
    bright: BRIGHT,
    glow: mixRgb(GLOW, WHITE, 0.35),
    warm: AMBER,
    ink: CORE,
    paper: hexToRgb(themes.light.elevated),
  },
};

/** The same family as SVG colours, for the 2D illustrations. */
export const artColors = {
  deep: brand.tile.stops[2],
  core: brand.tile.stops[1],
  bright: brand.tile.stops[0],
  glow: brand.glow,
  white: brand.ink[0],
  warm: pkuBrand.amber,
  /** Hot centre of the orb: glow pushed toward white. */
  hot: rgbToHex(mixRgb(GLOW, WHITE, 0.5)),
  /** Body shadow on the dark page. */
  night: rgbToHex(mixRgb(DEEP, hexToRgb(themes.dark.bg), 0.45)),
} as const;
