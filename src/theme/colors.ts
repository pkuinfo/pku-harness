/**
 * Colour tokens. `palette` holds raw values; `themes` maps them to semantic roles.
 * Dark is the reference design (see docs/DESIGN.md). Static hex values only, so they are
 * safe to use inside Reanimated styles.
 */
export const palette = {
  ink950: '#07080A',
  ink900: '#0E1013',
  ink850: '#14171B',
  ink800: '#1B1F24',
  ink750: '#23282E',
  ink600: '#3A414A',
  ink400: '#5E6672',
  ink300: '#8D95A1',
  ink100: '#E9ECF0',
  ink50: '#F5F6F8',
  white: '#FFFFFF',

  // PKU red, tuned per theme for contrast.
  pkuRedBright: '#F0444F',
  pkuRed: '#C8102E',
  pkuRedDeep: '#94070A',

  green: '#2EBD85',
  greenDeep: '#0E9F6E',
  red: '#F6465D',
  redDeep: '#D9304A',
  amber: '#F0B90B',
  amberDeep: '#B7860B',
  blue: '#3D8BFF',
  blueDeep: '#1F6FEB',
} as const;

export type ThemeColors = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentMuted: string;
  onAccent: string;
  up: string;
  upMuted: string;
  down: string;
  downMuted: string;
  warn: string;
  warnMuted: string;
  info: string;
  infoMuted: string;
  glow: string;
  scrim: string;
};

const dark: ThemeColors = {
  bg: palette.ink950,
  surface: palette.ink900,
  surface2: palette.ink850,
  surface3: palette.ink800,
  border: palette.ink750,
  text: palette.ink50,
  textMuted: palette.ink300,
  textFaint: palette.ink400,
  accent: palette.pkuRedBright,
  accentMuted: 'rgba(240, 68, 79, 0.16)',
  onAccent: palette.white,
  up: palette.green,
  upMuted: 'rgba(46, 189, 133, 0.14)',
  down: palette.red,
  downMuted: 'rgba(246, 70, 93, 0.14)',
  warn: palette.amber,
  warnMuted: 'rgba(240, 185, 11, 0.14)',
  info: palette.blue,
  infoMuted: 'rgba(61, 139, 255, 0.14)',
  glow: 'rgba(240, 68, 79, 0.55)',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

const light: ThemeColors = {
  bg: palette.ink50,
  surface: palette.white,
  surface2: '#EFF1F4',
  surface3: '#E5E8EC',
  border: '#DDE1E6',
  text: '#0B0D10',
  textMuted: '#59616C',
  textFaint: '#8D95A1',
  accent: palette.pkuRed,
  accentMuted: 'rgba(200, 16, 46, 0.10)',
  onAccent: palette.white,
  up: palette.greenDeep,
  upMuted: 'rgba(14, 159, 110, 0.12)',
  down: palette.redDeep,
  downMuted: 'rgba(217, 48, 74, 0.10)',
  warn: palette.amberDeep,
  warnMuted: 'rgba(183, 134, 11, 0.12)',
  info: palette.blueDeep,
  infoMuted: 'rgba(31, 111, 235, 0.10)',
  glow: 'rgba(200, 16, 46, 0.35)',
  scrim: 'rgba(11, 13, 16, 0.4)',
};

export const themes = { dark, light } as const;
export type ThemeName = keyof typeof themes;

/**
 * Course colours for the timetable: 8 hues, tuned per theme (fill = tinted background,
 * ink = text/edge). Index with `course.color % 8`.
 */
export const courseColors = {
  dark: [
    { fill: 'rgba(61, 139, 255, 0.18)', ink: '#7FB2FF' },
    { fill: 'rgba(46, 189, 133, 0.18)', ink: '#5FD3A5' },
    { fill: 'rgba(240, 185, 11, 0.18)', ink: '#F4CB4C' },
    { fill: 'rgba(240, 68, 79, 0.18)', ink: '#F57A82' },
    { fill: 'rgba(167, 112, 255, 0.18)', ink: '#BE97FF' },
    { fill: 'rgba(0, 190, 205, 0.18)', ink: '#4DD3DE' },
    { fill: 'rgba(255, 128, 64, 0.18)', ink: '#FFA375' },
    { fill: 'rgba(236, 72, 153, 0.18)', ink: '#F27AB6' },
  ],
  light: [
    { fill: 'rgba(31, 111, 235, 0.12)', ink: '#1A5FCC' },
    { fill: 'rgba(14, 159, 110, 0.12)', ink: '#0B7F58' },
    { fill: 'rgba(183, 134, 11, 0.14)', ink: '#8C6608' },
    { fill: 'rgba(200, 16, 46, 0.10)', ink: '#B00E28' },
    { fill: 'rgba(124, 58, 237, 0.12)', ink: '#6A2FD6' },
    { fill: 'rgba(0, 150, 165, 0.12)', ink: '#00788A' },
    { fill: 'rgba(230, 92, 0, 0.12)', ink: '#B84A00' },
    { fill: 'rgba(219, 39, 119, 0.12)', ink: '#B81F63' },
  ],
} as const;

/** Shader backdrop fields (src/components/shader-backdrop.tsx): canvas + four colour fields. */
export const backdropPalettes = {
  dark: { bg: '#07080A', c1: '#8E0F1E', c2: '#E8283A', c3: '#3A1466', c4: '#F29A4A' },
  light: { bg: '#F7F3F2', c1: '#F7C9CD', c2: '#F06A75', c3: '#D9CCF5', c4: '#FFD9B0' },
} as const;

/** Liquid-glass layers: base fill, top sheen and specular rim (3 stops each). */
export const glassTokens = {
  dark: {
    fill: 'rgba(255,255,255,0.05)',
    sheen: ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0.05)'],
    rim: ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.22)'],
    surface: 'rgba(20,22,26,0.62)',
  },
  light: {
    fill: 'rgba(255,255,255,0.35)',
    sheen: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.25)'],
    rim: ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.7)'],
    surface: 'rgba(255,255,255,0.72)',
  },
} as const;

/**
 * Peking University's official colours (《北京大学视觉形象识别系统》 A7 标准色 / A9 辅助色,
 * pku.edu.cn, 2019). 北大红 is RGB 139/0/18; the auxiliary colours are given in CMYK and were
 * sampled from the manual's swatches. Brand moments use these; UI states keep the semantic map.
 */
export const pkuBrand = {
  /** 北大红 PMS DS 821C, C0M100Y100K45. */
  red: '#8B0012',
  /** 专色金 Pantone 875C. */
  gold: '#895E43',
  /** C0M20Y35K30. */
  sand: '#BA9570',
  /** C0M0Y8K55. */
  stone: '#86837A',
  /** C60M50Y100K45, the pines of Yanyuan. */
  pine: '#44472C',
  /** C100M60Y0K50. */
  navy: '#0E3463',
  /** C60M35Y0K40. */
  slate: '#475C87',
  /** C0M35Y75K5. */
  amber: '#EFAA3C',
  /** 专色银 Pantone 877C. */
  silver: '#A7A5A6',
} as const;

/**
 * Aurora backdrop: a base and slow light blobs (centre as a fraction of the screen, radius as a
 * fraction of its width, colour). Restrained: a dim glow behind content, never a pattern.
 */
export const auroraPalettes = {
  dark: {
    base: '#09090B',
    blobs: [
      { x: 0.1, y: 0.05, r: 0.9, color: 'rgba(139, 0, 18, 0.32)' },
      { x: 0.95, y: 0.4, r: 0.7, color: 'rgba(137, 94, 67, 0.14)' },
      { x: 0.2, y: 0.95, r: 0.8, color: 'rgba(71, 92, 135, 0.12)' },
    ],
  },
  light: {
    base: '#F6F5F3',
    blobs: [
      { x: 0.1, y: 0.05, r: 0.9, color: 'rgba(139, 0, 18, 0.10)' },
      { x: 0.95, y: 0.4, r: 0.75, color: 'rgba(186, 149, 112, 0.18)' },
      { x: 0.2, y: 0.95, r: 0.85, color: 'rgba(71, 92, 135, 0.08)' },
    ],
  },
} as const;

/**
 * Glass material (Android / older iOS; iOS 26 uses the system glass). Restraint: a barely-there
 * fill, one hairline edge, and a thin light line along the top edge as the only highlight.
 */
export const glassMaterial = {
  dark: {
    fill: 'rgba(255, 255, 255, 0.025)',
    fillStrong: 'rgba(255, 255, 255, 0.045)',
    edge: 'rgba(255, 255, 255, 0.07)',
    /** Top-edge light: horizontal gradient for a 1px line. */
    topLight: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0) 100%)',
    pressed: 'rgba(255, 255, 255, 0.04)',
    shadow: undefined as string | undefined,
    brand: '#A3101F',
    brandEdge: 'rgba(255, 255, 255, 0.16)',
  },
  light: {
    fill: 'rgba(255, 255, 255, 0.22)',
    fillStrong: 'rgba(255, 255, 255, 0.4)',
    edge: 'rgba(255, 255, 255, 0.75)',
    topLight: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0) 100%)',
    pressed: 'rgba(17, 12, 10, 0.035)',
    shadow: '0 8px 24px rgba(17, 12, 10, 0.035)' as string | undefined,
    brand: '#8B0012',
    brandEdge: 'rgba(255, 255, 255, 0.22)',
  },
};
