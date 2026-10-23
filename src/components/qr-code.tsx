import QRCodeSvg from 'react-native-qrcode-svg';
import { View } from 'react-native';

import { revealLink } from '@/core/cloud/secret-link';
import type { SecretLink } from '@/core/runtime/types';
import { useT } from '@/i18n';
import { palette, radius, spacing } from '@/theme';

/**
 * Scannable QR: always dark-on-white with a quiet zone, whatever the app theme. `link` encodes a
 * share link the caller can't read (plugins); it wins over `value`.
 */
export function QRCode({ value, link, size = 220, ecl = 'L' }: { value?: string; link?: SecretLink; size?: number; ecl?: 'L' | 'M' | 'Q' | 'H' }) {
  const t = useT();
  const data = link ? revealLink(link) : value;
  if (!data) return null;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t('app.ui.qrCode')}
      style={{ backgroundColor: palette.white, padding: spacing.lg, borderRadius: radius.lg, borderCurve: 'continuous', alignSelf: 'center' }}>
      <QRCodeSvg value={data} size={size} ecl={ecl} color={palette.ink950} backgroundColor={palette.white} quietZone={0} />
    </View>
  );
}
