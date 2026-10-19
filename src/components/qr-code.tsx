import QRCodeSvg from 'react-native-qrcode-svg';
import { View } from 'react-native';

import { palette, radius, spacing } from '@/theme';

/** Scannable QR: always dark-on-white with a quiet zone, whatever the app theme. */
export function QRCode({ value, size = 220, ecl = 'L' }: { value: string; size?: number; ecl?: 'L' | 'M' | 'Q' | 'H' }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="二维码"
      style={{ backgroundColor: palette.white, padding: spacing.lg, borderRadius: radius.lg, borderCurve: 'continuous', alignSelf: 'center' }}>
      <QRCodeSvg value={value} size={size} ecl={ecl} color={palette.ink950} backgroundColor={palette.white} quietZone={0} />
    </View>
  );
}
