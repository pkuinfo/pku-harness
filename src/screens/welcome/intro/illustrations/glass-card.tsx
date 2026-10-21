import { Defs, G, LinearGradient, Line, Rect, Stop } from 'react-native-svg';

import type { ArtPalette } from './art-palette';

/** A card in SVG, in the app's glass material: barely-there fill, hairline edge, top light. */
export function GlassCard({ id, x, y, w, h, r = 16, p }: { id: string; x: number; y: number; w: number; h: number; r?: number; p: ArtPalette }) {
  return (
    <G>
      <Defs>
        <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={x} y1={y} x2={x + w} y2={y}>
          <Stop offset="0" stopColor={p.white} stopOpacity={0} />
          <Stop offset="0.5" stopColor={p.white} stopOpacity={p.cardTop} />
          <Stop offset="1" stopColor={p.white} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={x} y={y} width={w} height={h} rx={r} fill={p.cardFill} stroke={p.cardEdge} strokeWidth={0.75} />
      <Line x1={x + r} y1={y + 0.5} x2={x + w - r} y2={y + 0.5} stroke={`url(#${id})`} strokeWidth={1} />
    </G>
  );
}
