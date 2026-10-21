import { courseColors, palette, useTheme } from '@/theme';

/**
 * Chart colours, composed from theme tokens (no new hex). The categorical sets were checked with
 * the dataviz validator (lightness band, chroma, adjacent CVD ΔE ≥ 8, normal-vision ΔE ≥ 15,
 * ≥ 3:1 contrast) against both the dark (#09090B, #141316) and light (#F6F5F3, #FFFFFF)
 * surfaces, so the same steps serve both themes. Order is fixed: colour follows the series.
 */
const ink = courseColors.light;

/** 14-day tokens, bottom → top: 缓存命中输入 · 未缓存输入 · 输出. */
export const TOKEN_SERIES = [ink[0].ink, palette.pkuRed, ink[4].ink] as const;

/** Context sheet bar: 系统提示 · 工具定义 · 插件上下文 · 对话 · 工具结果. */
export const CONTEXT_SERIES = [ink[2].ink, ink[4].ink, ink[1].ink, palette.pkuRed, ink[0].ink] as const;

/** '#RRGGBB' (or '#RGB') + alpha → 'rgba(…)'; other strings pass through. */
export function withAlpha(color: string, alpha: number): string {
  let hex = color.startsWith('#') ? color.slice(1) : '';
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  if (hex.length !== 6) return color;
  const v = parseInt(hex, 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

/** Heat-map ramp: level 0 = surface2, 1–4 = the accent at rising alpha (one hue, light → dark). */
export function useHeatRamp(): readonly string[] {
  const c = useTheme();
  return [c.surface2, withAlpha(c.accent, 0.28), withAlpha(c.accent, 0.5), withAlpha(c.accent, 0.74), c.accent];
}
