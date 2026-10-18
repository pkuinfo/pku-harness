import type { TextStyle } from 'react-native';

/** Inter font family names, registered in src/app/_layout.tsx via expo-font. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/**
 * Named text styles. Colours are applied by the Text component (`tone`), not here,
 * so this file stays theme-independent. Line heights are generous for CJK text.
 */
export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 46, letterSpacing: -1.2 },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 36, letterSpacing: -0.6 },
  headline: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  callout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  micro: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6 },
  numberXL: {
    fontFamily: fonts.bold,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.6,
    fontVariant: ['tabular-nums'],
  },
  numberL: {
    fontFamily: fonts.semibold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  numberM: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
