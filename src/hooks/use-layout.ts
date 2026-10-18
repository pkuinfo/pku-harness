import { useWindowDimensions } from 'react-native';

/** Content never grows wider than this on tablets / landscape; it centers instead. */
export const MAX_CONTENT_WIDTH = 760;

/** Adaptive layout breakpoints shared by all screens. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const content = Math.min(width, MAX_CONTENT_WIDTH);
  return {
    width,
    height,
    contentWidth: content,
    isWide: width >= 700,
    isLandscape: width > height,
    /** Dashboard columns for small widgets. */
    columns: content >= 700 ? 3 : 2,
  };
}
