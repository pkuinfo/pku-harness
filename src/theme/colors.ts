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
