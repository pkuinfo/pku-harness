import { useId } from 'react';

import { glassMaterial, themes, useThemeName, type ThemeName } from '@/theme';

import { artColors } from '../../scene/palette';

/**
 * The illustration palette: the hero's glass-red family (scene/palette.ts) plus the theme's
 * glass surfaces, with per-theme opacities. On the dark page light glows; on the light page it
 * becomes tinted coverage and a soft warm shadow (the same rule the hero's shaders follow).
 */
export function artPalette(theme: ThemeName) {
  const dark = theme === 'dark';
  const t = themes[theme];
  const g = glassMaterial[theme];
  return {
    theme,
    dark,
    ...artColors,
    /** Orb body shadow stop. */
    shade: dark ? artColors.night : artColors.deep,
    /** Lines, beams, orbit paths. */
    line: dark ? artColors.glow : artColors.core,
    lineOpacity: dark ? 0.26 : 0.3,
    /** Service beads. */
    bead: dark ? artColors.hot : artColors.core,
    haloOpacity: dark ? 0.5 : 0.22,
    shadowOpacity: dark ? 0 : 0.16,
    glassFill: g.fillStrong,
    glassEdge: g.edge,
    /** Cards and nodes: glass on the dark page, paper with a hairline on the light one. */
    cardFill: dark ? g.fillStrong : t.elevated,
    cardEdge: dark ? g.edge : t.border,
    /** The thin light along a card's top edge. */
    cardTop: dark ? 0.22 : 1,
    page: t.bg,
    elevated: t.elevated,
    text: t.text,
    muted: t.textMuted,
    faint: t.textFaint,
    accent: t.accent,
    /** Unlit track (gauges, inactive dots). */
    track: t.surface3,
  };
}

export type ArtPalette = ReturnType<typeof artPalette>;

export const useArtPalette = () => artPalette(useThemeName());

/** A unique, url()-safe prefix for SVG gradient/pattern ids. */
export const useSvgId = (name: string) => `${name}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
