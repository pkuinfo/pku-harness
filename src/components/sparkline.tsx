import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

/** Minimal trend line with a soft gradient fill (dashboards). Scales to its container width. */
export function Sparkline({ values, tone = 'accent', height = 44 }: { values: number[]; tone?: 'accent' | 'up' | 'down' | 'info'; height?: number }) {
  const c = useTheme();
  const [w, setW] = useState(0);
  const color = tone === 'up' ? c.up : tone === 'down' ? c.down : tone === 'info' ? c.info : c.accent;
  const pts = values.filter((v) => Number.isFinite(v));
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  let line = '';
  let area = '';
  if (w > 0 && pts.length > 1) {
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, 3 + (1 - (v - min) / span) * (height - 6)] as const);
    line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    area = `${line} L${w} ${height} L0 ${height} Z`;
  }
  return (
    <View style={{ height }} onLayout={onLayout} accessibilityLabel={`趋势：${pts.join('、')}`}>
      {line ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#spark)" />
          <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
}
